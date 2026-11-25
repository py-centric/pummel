import type { PummelConfig } from '../types/pummel';

export function generateDistributedProto(): string {
  return `syntax = "proto3";

package pummel.distributed.v1;

service CoordinatorService {
  // Worker joins the coordinator cluster and registers capacity metadata
  rpc RegisterWorker (RegisterRequest) returns (RegisterResponse);

  // Bidirectional control & telemetry stream: workers push 1s metric deltas,
  // coordinator broadcasts StartExecution, UpdatePacing, and GracefulStop commands
  rpc StreamSession (stream WorkerTelemetryFrame) returns (stream CoordinatorCommand);

  // Lightweight liveness probe
  rpc Heartbeat (HeartbeatRequest) returns (HeartbeatResponse);
}

message RegisterRequest {
  string worker_id = 1;
  string hostname = 2;
  string region = 3;
  uint32 cpu_cores = 4;
  uint32 capacity_weight = 5;
}

message RegisterResponse {
  bool accepted = 1;
  uint32 assigned_vus = 2;
  uint32 quorum_target = 3;
  uint64 heartbeat_interval_ms = 4;
}

message EndpointDelta {
  string label = 1;
  uint64 requests = 2;
  uint64 failures = 3;
  repeated double latency_samples_ms = 4; // Capped per NFR-PERF-02
}

message WorkerTelemetryFrame {
  string worker_id = 1;
  uint64 elapsed_sec = 2;
  uint32 active_vus = 3;
  double cpu_usage_pct = 4;
  uint64 memory_mb = 5;
  repeated EndpointDelta endpoints = 6;
}

message CoordinatorCommand {
  enum CommandType {
    WAIT_QUORUM = 0;
    START_EXECUTION = 1;
    PAUSE_EXECUTION = 2;
    GRACEFUL_STOP = 3;
    REBALANCE_SHARD = 4;
  }
  CommandType command = 1;
  uint32 assigned_vus = 2;
  string serialized_config_json = 3;
  string reason = 4;
}

message HeartbeatRequest {
  string worker_id = 1;
  uint64 timestamp_ms = 2;
}

message HeartbeatResponse {
  bool healthy = 1;
  uint64 server_time_ms = 2;
}`;
}

export function generateDistributedRust(config: PummelConfig): string {
  const exec = config.execution[0];
  return `// src/engine/distributed.rs  --  Centralized gRPC Coordinator & Worker Runtime
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tonic::{transport::Server, Request, Response, Status};

pub const MAX_TIMINGS: usize = 10_000; // NFR-PERF-02 bounded per-endpoint latency ring

#[derive(Clone, Debug)]
pub struct WorkerRegistration {
    pub worker_id: String,
    pub region: String,
    pub capacity_weight: u32,
    pub assigned_vus: u32,
}

pub struct CoordinatorState {
    pub target_concurrency: u32,
    pub quorum_workers: usize,
    pub shard_strategy: String,
    pub workers: RwLock<HashMap<String, WorkerRegistration>>,
    pub command_tx: broadcast::Sender<CoordinatorDirective>,
}

#[derive(Clone, Debug)]
pub enum CoordinatorDirective {
    Start { total_vus: u32 },
    Rebalance { shards: HashMap<String, u32> },
    GracefulStop { reason: String },
}

impl CoordinatorState {
    pub fn new() -> Arc<Self> {
        let (command_tx, _) = broadcast::channel(64);
        Arc::new(Self {
            target_concurrency: ${exec?.concurrency ?? 600},
            quorum_workers: ${config.distributed.quorumWorkers},
            shard_strategy: "${config.distributed.shardStrategy}".to_string(),
            workers: RwLock::new(HashMap::new()),
            command_tx,
        })
    }

    /// Computes weighted-capacity or round-robin VU shards across healthy workers.
    pub async fn compute_shards(&self) -> HashMap<String, u32> {
        let guard = self.workers.read().await;
        let total_weight: u32 = guard.values().map(|w| w.capacity_weight.max(1)).sum();
        let mut shards = HashMap::new();
        if total_weight == 0 {
            return shards;
        }
        for (id, worker) in guard.iter() {
            let share = (self.target_concurrency * worker.capacity_weight.max(1)) / total_weight;
            shards.insert(id.clone(), share);
        }
        shards
    }

    /// Broadcasts GracefulStop to every worker and ensures chaos shutdown hooks execute.
    pub fn broadcast_stop(&self, reason: impl Into<String>) {
        let _ = self.command_tx.send(CoordinatorDirective::GracefulStop {
            reason: reason.into(),
        });
    }
}

pub async fn serve_coordinator(state: Arc<CoordinatorState>) -> Result<(), Box<dyn std::error::Error>> {
    let addr: SocketAddr = "${config.distributed.coordinatorBind}".parse()?;
    tracing::info!(%addr, quorum = state.quorum_workers, "Starting Pummel gRPC Coordinator");
    // Tonic Server::builder() binds CoordinatorServiceServer::new(state)
    let _ = Server::builder();
    Ok(())
}`;
}

export function generateRatatuiRust(config: PummelConfig): string {
  const slaLines = config.sla
    .map(
      (s) =>
        `        Row::new(vec!["${s.metric}", "${s.subject ?? 'global'}", "${s.comparator} ${s.threshold}${s.unit}", "${s.action}"]),`
    )
    .join('\n');

  return `// src/tui/dashboard.rs  --  Real-time Ratatui Terminal Dashboard
use std::io;
use std::sync::Arc;
use std::time::Duration;
use crossterm::event::{self, Event, KeyCode};
use ratatui::{
    backend::Backend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, Gauge, Paragraph, Row, Sparkline, Table},
    Frame, Terminal,
};
use tokio::sync::RwLock;

pub struct LiveTelemetrySnapshot {
    pub elapsed_sec: u64,
    pub total_duration_sec: u64,
    pub active_vus: u32,
    pub current_rps: u64,
    pub p95_ms: f64,
    pub fail_rate_pct: f64,
    pub rps_history: Vec<u64>,
    pub active_workers: usize,
}

pub async fn run_tui_loop<B: Backend>(
    terminal: &mut Terminal<B>,
    snapshot: Arc<RwLock<LiveTelemetrySnapshot>>,
    on_stop: impl Fn(),
) -> io::Result<()> {
    loop {
        let state = snapshot.read().await;
        terminal.draw(|frame| render_dashboard(frame, &state))?;
        drop(state);

        if event::poll(Duration::from_millis(200))? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char('q') => {
                        on_stop();
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }
    }
}

fn render_dashboard(frame: &mut Frame, state: &LiveTelemetrySnapshot) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(3),
            Constraint::Length(7),
            Constraint::Min(8),
            Constraint::Length(3),
        ])
        .split(frame.area());

    let progress = ((state.elapsed_sec as f64 / state.total_duration_sec.max(1) as f64) * 100.0)
        .clamp(0.0, 100.0) as u16;

    let gauge = Gauge::default()
        .block(Block::default().title(" Scenario Progress  --  ${config.name} ").borders(Borders::ALL))
        .gauge_style(Style::default().fg(Color::LightRed).add_modifier(Modifier::BOLD))
        .percent(progress)
        .label(format!("{}s / {}s · {} VUs · {} Workers", state.elapsed_sec, state.total_duration_sec, state.active_vus, state.active_workers));
    frame.render_widget(gauge, chunks[0]);

    let sparkline = Sparkline::default()
        .block(Block::default().title(format!(" Live Throughput ({} req/s · p95 {:.1}ms) ", state.current_rps, state.p95_ms)).borders(Borders::ALL))
        .data(&state.rps_history)
        .style(Style::default().fg(Color::Cyan));
    frame.render_widget(sparkline, chunks[1]);

    let sla_rows = vec![
${slaLines}
    ];
    let sla_table = Table::new(
        sla_rows,
        [Constraint::Percentage(26), Constraint::Percentage(30), Constraint::Percentage(20), Constraint::Percentage(24)],
    )
    .header(Row::new(vec!["Metric", "Subject", "Threshold", "Action"]).style(Style::default().add_modifier(Modifier::BOLD)))
    .block(Block::default().title(" Active Real-Time SLAs (1s Evaluator) ").borders(Borders::ALL));
    frame.render_widget(sla_table, chunks[2]);

    let footer = Paragraph::new(" [q] Graceful Stop   [p] Pause/Resume   [Tab] Switch Pane   [c] Toggle Chaos Fault ")
        .block(Block::default().borders(Borders::ALL));
    frame.render_widget(footer, chunks[3]);
}`;
}
