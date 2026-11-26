use chrono::{Duration, Utc};
use pummel::control_plane::ControlPlaneState;
use pummel::engine::anomaly::{
    DetectedAnomaly, PostRunAnalysis, TelemetrySample, generate_post_run_analysis,
};
use pummel::engine::compliance::{
    ComplianceItem, DiffLine, ScenarioTemplate, built_in_templates, compute_line_diff,
    evaluate_compliance_matrix,
};
use pummel::engine::data_sources::validate_path_within_roots;
use pummel::engine::distributed::{AutoScaleDecision, ShardStrategy, WorkerNode};
use pummel::engine::projects::{
    DiscoveredScenario, ProjectEntry, SessionRunStatus, WorkspaceSession,
    discover_session_scenarios,
};
use pummel::engine::scheduler::{ScheduleRecurrence, ScheduledTestTask};
use pummel::engine::storage::{ConfigSnapshot, PummelStore, StoredSession};
use pummel::engine::webhooks::{
    WebhookDeliveryRecord, WebhookEventKind, WebhookIntegration, WebhookProvider,
    validate_webhook_url,
};
use pummel::models::config::Configuration;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActiveTab {
    ClusterOverview,
    Workspace,
    Telemetry,
    Operations,
    Compliance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeMode {
    Dark,
    Light,
}

#[derive(Debug, Clone)]
pub struct UiLogEntry {
    pub timestamp: String,
    pub level: String,
    pub source: String,
    pub message: String,
}

pub struct PummelAppState {
    pub control_plane: ControlPlaneState,
    pub control_plane_port: u16,
    pub active_tab: ActiveTab,
    pub theme: ThemeMode,
    pub projects: Vec<ProjectEntry>,
    pub workspace_sessions: Vec<WorkspaceSession>,
    pub active_session_id: String,
    pub discovered_scenarios: Vec<DiscoveredScenario>,
    pub active_yaml: String,
    pub selected_template_id: String,
    pub export_target: String,
    pub exported_preview: String,
    pub validation_ok: bool,
    pub validation_messages: Vec<String>,
    pub snapshots: Vec<ConfigSnapshot>,
    pub diff_lines: Vec<DiffLine>,
    pub schedules: Vec<ScheduledTestTask>,
    pub webhooks: Vec<WebhookIntegration>,
    pub deliveries: Vec<WebhookDeliveryRecord>,
    pub sessions: Vec<StoredSession>,
    pub compliance_items: Vec<ComplianceItem>,
    pub templates: Vec<ScenarioTemplate>,
    pub logs: Vec<UiLogEntry>,
    pub compliance_filter: String,
    pub search_query: String,
    pub status_banner: String,
    pub target_concurrency: usize,
}

impl PummelAppState {
    /// Initializes GPUI application state backed by `PummelStore` and `ControlPlaneState`.
    #[must_use]
    pub fn new(store: PummelStore, control_plane_port: u16) -> Self {
        let templates = built_in_templates();
        let initial_yaml = templates
            .first()
            .map(|t| t.yaml.clone())
            .unwrap_or_default();
        let control_plane = ControlPlaneState::new(store);
        let snapshots = control_plane.store.list_snapshots().unwrap_or_default();
        let schedules = control_plane
            .store
            .list_json::<ScheduledTestTask>("scheduled_tests")
            .unwrap_or_default();
        let webhooks = control_plane
            .store
            .list_json::<WebhookIntegration>("webhooks")
            .unwrap_or_default();
        let deliveries = control_plane
            .store
            .list_webhook_deliveries::<WebhookDeliveryRecord>(50)
            .unwrap_or_default();
        let sessions = control_plane.store.list_sessions(20).unwrap_or_default();
        let projects = control_plane
            .store
            .list_json::<ProjectEntry>("projects")
            .unwrap_or_default();
        let mut workspace_sessions = control_plane
            .store
            .list_json::<WorkspaceSession>("workspace_sessions")
            .unwrap_or_default();

        if workspace_sessions.is_empty() {
            let default_project_ids: Vec<String> = projects.iter().map(|p| p.id.clone()).collect();
            let default_session = WorkspaceSession::new(
                "Default Session".to_string(),
                default_project_ids,
                initial_yaml.clone(),
            );
            let _ = control_plane.store.upsert_json(
                "workspace_sessions",
                &default_session.id,
                &default_session,
            );
            workspace_sessions.push(default_session);
        }

        let active_session_id = workspace_sessions[0].id.clone();
        let active_yaml = if workspace_sessions[0].active_yaml.trim().is_empty() {
            initial_yaml
        } else {
            workspace_sessions[0].active_yaml.clone()
        };

        let mut state = Self {
            control_plane,
            control_plane_port,
            active_tab: ActiveTab::ClusterOverview,
            theme: ThemeMode::Dark,
            projects,
            workspace_sessions,
            active_session_id,
            discovered_scenarios: Vec::new(),
            active_yaml,
            selected_template_id: "smoke".to_string(),
            export_target: "k6".to_string(),
            exported_preview: String::new(),
            validation_ok: true,
            validation_messages: vec!["Ready for dry-run validation".to_string()],
            snapshots,
            diff_lines: Vec::new(),
            schedules,
            webhooks,
            deliveries,
            sessions,
            compliance_items: Vec::new(),
            templates,
            logs: vec![UiLogEntry {
                timestamp: Utc::now().format("%H:%M:%S").to_string(),
                level: "INFO".to_string(),
                source: "control-plane".to_string(),
                message: format!(
                    "Pummel GPUI initialized with 127.0.0.1:{control_plane_port} Control Plane"
                ),
            }],
            compliance_filter: "All".to_string(),
            search_query: String::new(),
            status_banner: "Idle — Ready".to_string(),
            target_concurrency: 20,
        };
        state.refresh_discovered_scenarios();
        state.refresh_compliance();
        state.refresh_export_preview();
        state
    }

    pub fn push_log(&mut self, level: &str, source: &str, message: impl Into<String>) {
        self.logs.insert(
            0,
            UiLogEntry {
                timestamp: Utc::now().format("%H:%M:%S").to_string(),
                level: level.to_string(),
                source: source.to_string(),
                message: message.into(),
            },
        );
        self.logs.truncate(150);
    }

    pub fn load_template(&mut self, template_id: &str) {
        if let Some(tpl) = self.templates.iter().find(|t| t.id == template_id).cloned() {
            self.selected_template_id = tpl.id.clone();
            self.active_yaml = tpl.yaml;
            self.status_banner = format!("Loaded template '{}'", tpl.name);
            self.push_log(
                "INFO",
                "workspace",
                format!("Loaded template '{}'", tpl.name),
            );
            self.validate_active_yaml();
            self.refresh_compliance();
            self.refresh_export_preview();
        }
    }

    pub fn validate_active_yaml(&mut self) -> bool {
        match serde_yaml::from_str::<Configuration>(&self.active_yaml) {
            Ok(cfg) => {
                self.validation_ok = true;
                self.validation_messages = vec![format!(
                    "[OK] Parsed {} execution(s) and {} scenario(s) under strict deny_unknown_fields",
                    cfg.execution.len(),
                    cfg.scenarios.len()
                )];
                self.status_banner = "Dry-run syntax & schema check passed".to_string();
                self.push_log(
                    "INFO",
                    "validator",
                    "Active YAML passed strict schema validation",
                );
                true
            }
            Err(err) => {
                self.validation_ok = false;
                self.validation_messages = vec![format!("[SERDE] {err}")];
                self.status_banner = "Validation failed".to_string();
                self.push_log("WARN", "validator", format!("Schema error: {err}"));
                false
            }
        }
    }

    pub fn refresh_export_preview(&mut self) {
        match serde_yaml::from_str::<Configuration>(&self.active_yaml) {
            Ok(cfg) => match pummel::exporter::export(&cfg, &self.export_target) {
                Ok(script) => {
                    self.exported_preview = script;
                }
                Err(e) => {
                    self.exported_preview = format!("Export error: {e}");
                }
            },
            Err(e) => {
                self.exported_preview = format!("Parse error: {e}");
            }
        }
    }

    pub fn set_export_target(&mut self, target: &str) {
        self.export_target = target.to_string();
        self.refresh_export_preview();
        self.push_log(
            "INFO",
            "exporter",
            format!("Generated {target} export preview"),
        );
    }

    pub fn save_snapshot(&mut self, name: String) {
        let snap = ConfigSnapshot {
            id: format!("snap-{}", &Uuid::new_v4().to_string()[..8]),
            name: name.clone(),
            format: "yaml".to_string(),
            content: self.active_yaml.clone(),
            created_at: Utc::now().to_rfc3339(),
        };
        if self.control_plane.store.save_snapshot(&snap).is_ok() {
            if let Some(prev) = self.snapshots.first() {
                self.diff_lines = compute_line_diff(&prev.content, &snap.content);
            }
            self.snapshots = self
                .control_plane
                .store
                .list_snapshots()
                .unwrap_or_default();
            self.status_banner = format!("Saved snapshot '{name}'");
            self.push_log("INFO", "snapshots", format!("Saved snapshot '{name}'"));
        }
    }

    pub fn restore_snapshot(&mut self, id: &str) {
        if let Some(snap) = self.snapshots.iter().find(|s| s.id == id).cloned() {
            self.diff_lines = compute_line_diff(&self.active_yaml, &snap.content);
            self.active_yaml = snap.content;
            self.status_banner = format!("Restored snapshot '{}'", snap.name);
            self.push_log(
                "INFO",
                "snapshots",
                format!("Restored snapshot '{}'", snap.name),
            );
            self.validate_active_yaml();
            self.refresh_compliance();
            self.refresh_export_preview();
        }
    }

    pub fn add_worker(&mut self, region: &str) {
        let count = self.workers().len() + 1;
        let port = 8000 + count as u16;
        let node = {
            let mut cluster = self
                .control_plane
                .cluster
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let node = cluster.register_worker(
                "127.0.0.1".to_string(),
                region.to_string(),
                format!("http://127.0.0.1:{port}"),
                4,
                100,
            );
            cluster.distribute_vus(self.target_concurrency);
            node
        };
        self.push_log(
            "INFO",
            "cluster",
            format!("Registered worker {} in {}", node.id, node.region),
        );
        self.refresh_compliance();
    }

    pub fn remove_worker(&mut self, id: &str) {
        let removed = {
            let mut cluster = self
                .control_plane
                .cluster
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let ok = cluster.remove_worker(id);
            cluster.distribute_vus(self.target_concurrency);
            ok
        };
        if removed {
            self.push_log("WARN", "cluster", format!("Removed worker {id}"));
            self.refresh_compliance();
        }
    }

    pub fn toggle_shard_strategy(&mut self) {
        let next = {
            let mut cluster = self
                .control_plane
                .cluster
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            cluster.shard_strategy = match cluster.shard_strategy {
                ShardStrategy::WeightedCapacity => ShardStrategy::RoundRobin,
                ShardStrategy::RoundRobin => ShardStrategy::WeightedCapacity,
            };
            cluster.distribute_vus(self.target_concurrency);
            cluster.shard_strategy
        };
        self.push_log(
            "INFO",
            "cluster",
            format!("Shard strategy switched to {next:?}"),
        );
    }

    pub fn distribute_vus(&mut self, concurrency: usize) {
        self.target_concurrency = concurrency;
        let mut cluster = self
            .control_plane
            .cluster
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        cluster.distribute_vus(concurrency);
    }

    pub fn toggle_auto_scale(&mut self) {
        let enabled = {
            let mut cluster = self
                .control_plane
                .cluster
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            cluster.auto_scale.enabled = !cluster.auto_scale.enabled;
            cluster.auto_scale.enabled
        };
        self.push_log(
            "INFO",
            "autoscale",
            format!(
                "Auto-scaling {}",
                if enabled { "enabled" } else { "disabled" }
            ),
        );
    }

    pub fn add_schedule(&mut self, name: String, recurrence: ScheduleRecurrence) {
        let task = ScheduledTestTask::new(
            name.clone(),
            self.active_yaml.clone(),
            recurrence,
            Utc::now() + Duration::minutes(15),
        );
        if self
            .control_plane
            .store
            .upsert_json("scheduled_tests", &task.id, &task)
            .is_ok()
        {
            self.schedules = self
                .control_plane
                .store
                .list_json::<ScheduledTestTask>("scheduled_tests")
                .unwrap_or_default();
            self.push_log(
                "INFO",
                "scheduler",
                format!("Scheduled '{name}' ({recurrence:?})"),
            );
        }
    }

    pub fn delete_schedule(&mut self, id: &str) {
        if self
            .control_plane
            .store
            .delete_json("scheduled_tests", id)
            .unwrap_or(false)
        {
            self.schedules = self
                .control_plane
                .store
                .list_json::<ScheduledTestTask>("scheduled_tests")
                .unwrap_or_default();
            self.push_log("WARN", "scheduler", format!("Deleted schedule {id}"));
        }
    }

    pub fn add_webhook(&mut self, name: String, provider: WebhookProvider, url: String) {
        if let Err(err) = validate_webhook_url(&url) {
            self.status_banner = format!("Invalid webhook URL: {err}");
            return;
        }
        let hook = WebhookIntegration {
            id: format!("hook-{}", &Uuid::new_v4().to_string()[..8]),
            name: name.clone(),
            provider,
            url,
            enabled: true,
            events: vec![
                WebhookEventKind::SlaBreach,
                WebhookEventKind::AnomalyDetected,
                WebhookEventKind::RunAborted,
            ],
        };
        if self
            .control_plane
            .store
            .upsert_json("webhooks", &hook.id, &hook)
            .is_ok()
        {
            self.webhooks = self
                .control_plane
                .store
                .list_json::<WebhookIntegration>("webhooks")
                .unwrap_or_default();
            self.push_log(
                "INFO",
                "webhooks",
                format!("Added {provider:?} webhook '{name}'"),
            );
        }
    }

    pub fn delete_webhook(&mut self, id: &str) {
        if self
            .control_plane
            .store
            .delete_json("webhooks", id)
            .unwrap_or(false)
        {
            self.webhooks = self
                .control_plane
                .store
                .list_json::<WebhookIntegration>("webhooks")
                .unwrap_or_default();
            self.push_log("WARN", "webhooks", format!("Removed webhook {id}"));
        }
    }

    pub fn refresh_compliance(&mut self) {
        let cluster = self
            .control_plane
            .cluster
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        if let Ok(cfg) = serde_yaml::from_str::<Configuration>(&self.active_yaml) {
            self.compliance_items = evaluate_compliance_matrix(&cfg, &cluster);
        }
    }

    #[must_use]
    pub fn workers(&self) -> Vec<WorkerNode> {
        self.control_plane
            .cluster
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .workers
            .clone()
    }

    #[must_use]
    pub fn auto_scale_decision(&self) -> AutoScaleDecision {
        let cluster = self
            .control_plane
            .cluster
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let latest_p95 = self
            .telemetry_samples()
            .last()
            .map(|s| s.p95_ms)
            .unwrap_or(0.0);
        let now_sec = Utc::now().timestamp().max(0) as u64;
        cluster.evaluate_auto_scale(latest_p95, now_sec)
    }

    #[must_use]
    pub fn telemetry_samples(&self) -> Vec<TelemetrySample> {
        self.control_plane
            .telemetry_history
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    #[must_use]
    pub fn anomalies(&self) -> Vec<DetectedAnomaly> {
        self.control_plane
            .anomalies
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    #[must_use]
    pub fn post_run_analysis(&self) -> PostRunAnalysis {
        let metrics = self
            .control_plane
            .metrics
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let total_req: u64 = metrics.endpoints.values().map(|e| e.count as u64).sum();
        let total_fail: u64 = metrics.endpoints.values().map(|e| e.failures as u64).sum();
        generate_post_run_analysis(
            total_req,
            total_fail,
            &self.telemetry_samples(),
            &self.anomalies(),
        )
    }

    #[must_use]
    pub fn active_session(&self) -> Option<&WorkspaceSession> {
        self.workspace_sessions
            .iter()
            .find(|s| s.id == self.active_session_id)
    }

    pub fn refresh_discovered_scenarios(&mut self) {
        if let Some(sess) = self.active_session() {
            self.discovered_scenarios = discover_session_scenarios(sess, &self.projects);
        } else {
            self.discovered_scenarios.clear();
        }
    }

    /// Registers a project root directory, persists it to SQLite, and attaches it to the active session.
    pub fn register_project_dir(&mut self, path: &Path) -> Option<ProjectEntry> {
        let entry = match ProjectEntry::from_directory(path, None) {
            Ok(e) => e,
            Err(err) => {
                self.status_banner = format!("Failed to add project: {err}");
                self.push_log("WARN", "projects", format!("Invalid project path: {err}"));
                return None;
            }
        };

        let proj = if let Some(existing) = self
            .projects
            .iter()
            .find(|p| p.root_path == entry.root_path)
            .cloned()
        {
            existing
        } else {
            let _ = self
                .control_plane
                .store
                .upsert_json("projects", &entry.id, &entry);
            self.projects.push(entry.clone());
            self.push_log(
                "INFO",
                "projects",
                format!("Added project '{}' ({})", entry.name, entry.root_path),
            );
            entry
        };

        self.attach_project_to_active_session(&proj.id);
        self.status_banner = format!("Project '{}' attached to active session", proj.name);
        Some(proj)
    }

    pub fn create_workspace_session(&mut self, name: String, project_ids: Vec<String>) -> String {
        self.persist_active_session_yaml();
        let initial_yaml = self
            .templates
            .first()
            .map(|t| t.yaml.clone())
            .unwrap_or_default();
        let sess = WorkspaceSession::new(name.clone(), project_ids, initial_yaml.clone());
        let id = sess.id.clone();
        let _ = self
            .control_plane
            .store
            .upsert_json("workspace_sessions", &sess.id, &sess);
        self.workspace_sessions.push(sess);
        self.active_session_id = id.clone();
        self.active_yaml = initial_yaml;
        self.refresh_discovered_scenarios();
        self.refresh_compliance();
        self.refresh_export_preview();
        self.status_banner = format!("Created session '{name}'");
        self.push_log("INFO", "sessions", format!("Created session '{name}'"));
        id
    }

    pub fn switch_session(&mut self, session_id: &str) {
        if self.active_session_id == session_id {
            return;
        }
        self.persist_active_session_yaml();
        if let Some(target) = self
            .workspace_sessions
            .iter()
            .find(|s| s.id == session_id)
            .cloned()
        {
            self.active_session_id = target.id.clone();
            if !target.active_yaml.trim().is_empty() {
                self.active_yaml = target.active_yaml;
            }
            self.refresh_discovered_scenarios();
            self.validate_active_yaml();
            self.refresh_compliance();
            self.refresh_export_preview();
            self.status_banner = format!(
                "Switched to session '{}' ({} project(s))",
                target.name,
                target.project_ids.len()
            );
        }
    }

    pub fn attach_project_to_active_session(&mut self, project_id: &str) {
        if let Some(sess) = self
            .workspace_sessions
            .iter_mut()
            .find(|s| s.id == self.active_session_id)
            && sess.attach_project(project_id.to_string())
        {
            let _ = self
                .control_plane
                .store
                .upsert_json("workspace_sessions", &sess.id, sess);
        }
        self.refresh_discovered_scenarios();
    }

    pub fn detach_project_from_active_session(&mut self, project_id: &str) {
        if let Some(sess) = self
            .workspace_sessions
            .iter_mut()
            .find(|s| s.id == self.active_session_id)
            && sess.detach_project(project_id)
        {
            let _ = self
                .control_plane
                .store
                .upsert_json("workspace_sessions", &sess.id, sess);
        }
        self.refresh_discovered_scenarios();
    }

    /// Loads a scenario file from disk after verifying it is inside the active session's registered project roots.
    pub fn load_discovered_scenario(&mut self, file_path: &str) -> bool {
        let allowed_roots = self
            .active_session()
            .map(|s| s.resolved_roots(&self.projects))
            .unwrap_or_default();
        let validated = match validate_path_within_roots(file_path, &allowed_roots) {
            Ok(p) => p,
            Err(err) => {
                self.status_banner = format!("Blocked scenario load: {err}");
                self.push_log("WARN", "security", format!("{err}"));
                return false;
            }
        };
        let Ok(content) = std::fs::read_to_string(&validated) else {
            self.status_banner = format!("Failed to read '{}'", validated.display());
            return false;
        };
        self.active_yaml = content.clone();
        if let Some(sess) = self
            .workspace_sessions
            .iter_mut()
            .find(|s| s.id == self.active_session_id)
        {
            sess.active_scenario_path = Some(validated.display().to_string());
            sess.active_yaml = content;
            sess.updated_at = Utc::now().to_rfc3339();
            let _ = self
                .control_plane
                .store
                .upsert_json("workspace_sessions", &sess.id, sess);
        }
        self.validate_active_yaml();
        self.refresh_compliance();
        self.refresh_export_preview();
        self.status_banner = format!("Loaded scenario '{}'", validated.display());
        true
    }

    pub fn set_session_run_status(&mut self, session_id: &str, status: SessionRunStatus) {
        if let Some(sess) = self
            .workspace_sessions
            .iter_mut()
            .find(|s| s.id == session_id)
        {
            sess.run_status = status;
            sess.updated_at = Utc::now().to_rfc3339();
            let _ = self
                .control_plane
                .store
                .upsert_json("workspace_sessions", &sess.id, sess);
        }
    }

    fn persist_active_session_yaml(&mut self) {
        if let Some(sess) = self
            .workspace_sessions
            .iter_mut()
            .find(|s| s.id == self.active_session_id)
        {
            sess.active_yaml = self.active_yaml.clone();
            sess.updated_at = Utc::now().to_rfc3339();
            let _ = self
                .control_plane
                .store
                .upsert_json("workspace_sessions", &sess.id, sess);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpui_state_workflows_end_to_end() {
        let store = PummelStore::open_in_memory().expect("in-memory store");
        let mut state = PummelAppState::new(store, 8000);

        assert!(state.validate_active_yaml());
        assert!(!state.compliance_items.is_empty());
        assert!(state.exported_preview.contains("export const options"));

        state.save_snapshot("Initial Smoke".into());
        assert_eq!(state.snapshots.len(), 1);

        state.load_template("chaos");
        state.save_snapshot("Chaos Profile".into());
        assert_eq!(state.snapshots.len(), 2);
        assert!(!state.diff_lines.is_empty());

        state.add_worker("eu-west-1");
        assert_eq!(state.workers().len(), 2);
        state.distribute_vus(40);
        let total_vus: usize = state.workers().iter().map(|w| w.assigned_vus).sum();
        assert_eq!(total_vus, 40);

        state.add_schedule("Nightly Stress".into(), ScheduleRecurrence::Daily);
        assert_eq!(state.schedules.len(), 1);

        state.add_webhook(
            "Ops Slack".into(),
            WebhookProvider::Slack,
            "https://hooks.slack.com/services/T/B/X".into(),
        );
        assert_eq!(state.webhooks.len(), 1);
    }

    #[test]
    fn test_gpui_multiproject_sessions_and_scoped_loading() {
        let base = std::env::temp_dir().join(format!("pummel_gpui_test_{}", Uuid::new_v4()));
        let dir_a = base.join("svc_a");
        let dir_b = base.join("svc_b");
        let outside = base.join("outside");
        std::fs::create_dir_all(&dir_a).unwrap();
        std::fs::create_dir_all(&dir_b).unwrap();
        std::fs::create_dir_all(&outside).unwrap();

        let yaml_a = dir_a.join("a.yaml");
        let yaml_b = dir_b.join("b.yaml");
        let yaml_out = outside.join("secret.yaml");
        let valid_yaml = "execution:\n  - concurrency: 2\n    ramp-up: 1s\n    hold-for: 2s\n    scenario: s\nscenarios:\n  s:\n    requests:\n      - url: http://127.0.0.1:8080/ok\n";
        std::fs::write(&yaml_a, valid_yaml).unwrap();
        std::fs::write(&yaml_b, valid_yaml).unwrap();
        std::fs::write(&yaml_out, valid_yaml).unwrap();

        let store = PummelStore::open_in_memory().expect("in-memory store");
        let mut state = PummelAppState::new(store, 8000);

        let pa = state.register_project_dir(&dir_a).expect("project A");
        let pb = state.register_project_dir(&dir_b).expect("project B");
        assert_eq!(state.projects.len(), 2);
        assert_eq!(state.discovered_scenarios.len(), 2);

        // Multi-project session can load from both A and B, but blocks outside directory
        assert!(state.load_discovered_scenario(&yaml_b.display().to_string()));
        assert!(!state.load_discovered_scenario(&yaml_out.display().to_string()));

        // Switch to a second independent session scoped only to Project A
        let s2 = state.create_workspace_session("Service A Only".into(), vec![pa.id.clone()]);
        assert_eq!(state.active_session_id, s2);
        assert_eq!(state.discovered_scenarios.len(), 1);
        assert!(state.load_discovered_scenario(&yaml_a.display().to_string()));
        assert!(!state.load_discovered_scenario(&yaml_b.display().to_string()));

        // Attach Project B dynamically to turn s2 into a multi-project session
        state.attach_project_to_active_session(&pb.id);
        assert_eq!(state.discovered_scenarios.len(), 2);

        let _ = std::fs::remove_dir_all(&base);
    }
}
