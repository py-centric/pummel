pub mod state;
pub mod views;

use gpui::{
    App, AppContext, Bounds, Context, InteractiveElement, IntoElement, ParentElement, Render,
    SharedString, StatefulInteractiveElement, Styled, Window, WindowBounds, WindowOptions, div,
    px, rgb,
};
use pummel::engine::storage::PummelStore;
use state::{ActiveTab, PummelAppState, ThemeMode};

pub struct PummelRootView {
    pub state: PummelAppState,
}

impl PummelRootView {
    #[must_use]
    pub fn new(store: PummelStore, control_plane_port: u16) -> Self {
        Self {
            state: PummelAppState::new(store, control_plane_port),
        }
    }

    fn tab_button(
        &self,
        id: &'static str,
        label: &'static str,
        tab: ActiveTab,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let active = self.state.active_tab == tab;
        let bg = if active { rgb(0x2563eb) } else { rgb(0x1e293b) };
        div()
            .id(id)
            .px_3()
            .py_1()
            .rounded_md()
            .bg(bg)
            .text_color(rgb(0xf8fafc))
            .cursor_pointer()
            .child(SharedString::from(label))
            .on_click(cx.listener(move |this, _event, _window, cx| {
                this.state.active_tab = tab;
                cx.notify();
            }))
    }
}

impl Render for PummelRootView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let (bg, panel_bg, text_color, muted_color) = match self.state.theme {
            ThemeMode::Dark => (rgb(0x0f172a), rgb(0x1e293b), rgb(0xf8fafc), rgb(0x94a3b8)),
            ThemeMode::Light => (rgb(0xf8fafc), rgb(0xe2e8f0), rgb(0x0f172a), rgb(0x475569)),
        };

        let active_body = match self.state.active_tab {
            ActiveTab::ClusterOverview => views::cluster::render_cluster_view(self, cx),
            ActiveTab::Workspace => views::workspace::render_workspace_view(self, cx),
            ActiveTab::Telemetry => views::telemetry::render_telemetry_view(self, cx),
            ActiveTab::Operations => views::operations::render_operations_view(self, cx),
            ActiveTab::Compliance => views::compliance::render_compliance_view(self, cx),
        };

        div()
            .flex()
            .flex_col()
            .size_full()
            .bg(bg)
            .text_color(text_color)
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_4()
                    .py_2()
                    .bg(panel_bg)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .child(SharedString::from("PUMMEL"))
                            .child(self.tab_button(
                                "tab-cluster",
                                "Cluster",
                                ActiveTab::ClusterOverview,
                                cx,
                            ))
                            .child(self.tab_button(
                                "tab-workspace",
                                "Workspace",
                                ActiveTab::Workspace,
                                cx,
                            ))
                            .child(self.tab_button(
                                "tab-telemetry",
                                "Telemetry",
                                ActiveTab::Telemetry,
                                cx,
                            ))
                            .child(self.tab_button(
                                "tab-ops",
                                "Operations",
                                ActiveTab::Operations,
                                cx,
                            ))
                            .child(self.tab_button(
                                "tab-compliance",
                                "Compliance",
                                ActiveTab::Compliance,
                                cx,
                            )),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_3()
                            .child(div().text_color(muted_color).child(SharedString::from(
                                format!(
                                    "Control Plane: 127.0.0.1:{}",
                                    self.state.control_plane_port
                                ),
                            )))
                            .child(
                                div()
                                    .id("btn-theme")
                                    .px_2()
                                    .py_1()
                                    .rounded_md()
                                    .bg(rgb(0x334155))
                                    .text_color(rgb(0xf8fafc))
                                    .cursor_pointer()
                                    .child(SharedString::from(match self.state.theme {
                                        ThemeMode::Dark => "Light",
                                        ThemeMode::Light => "Dark",
                                    }))
                                    .on_click(cx.listener(|this, _ev, _win, cx| {
                                        this.state.theme = match this.state.theme {
                                            ThemeMode::Dark => ThemeMode::Light,
                                            ThemeMode::Light => ThemeMode::Dark,
                                        };
                                        cx.notify();
                                    })),
                            ),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_1()
                    .size_full()
                    .child(views::sidebar::render_workspace_sidebar(self, cx))
                    .child(div().flex_1().p_4().child(active_body)),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_4()
                    .py_1()
                    .bg(panel_bg)
                    .text_color(muted_color)
                    .child(SharedString::from(self.state.status_banner.clone()))
                    .child(SharedString::from(format!(
                        "Projects: {} | Sessions: {} | Workers: {} | Snapshots: {}",
                        self.state.projects.len(),
                        self.state.workspace_sessions.len(),
                        self.state.workers().len(),
                        self.state.snapshots.len()
                    ))),
            )
    }
}

/// Launches the native GPUI desktop application alongside the localhost-only Axum Control Plane.
pub fn run_gpui_app(control_plane_port: u16, initial_projects: Vec<std::path::PathBuf>) {
    let db_path = PummelStore::default_db_path();
    let store = PummelStore::open(&db_path).unwrap_or_else(|_| {
        PummelStore::open_in_memory().expect("in-memory SQLite store fallback")
    });
    let mut bootstrap = PummelRootView::new(store, control_plane_port);
    for proj_dir in &initial_projects {
        bootstrap.state.register_project_dir(proj_dir);
    }
    let cp_state = bootstrap.state.control_plane.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime for control plane");
        rt.block_on(async move {
            if let Err(err) = pummel::control_plane::serve(control_plane_port, cp_state).await {
                eprintln!("Control plane error: {err}");
            }
        });
    });

    gpui_platform::application().run(move |cx: &mut App| {
        let bounds = Bounds::centered(None, gpui::size(px(1380.0), px(860.0)), cx);
        let initial_projects_clone = initial_projects.clone();
        let _ = cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            move |_, cx| {
                let store =
                    PummelStore::open(PummelStore::default_db_path()).unwrap_or_else(|_| {
                        PummelStore::open_in_memory().expect("in-memory SQLite store fallback")
                    });
                let mut root = PummelRootView::new(store, control_plane_port);
                for proj_dir in &initial_projects_clone {
                    root.state.register_project_dir(proj_dir);
                }
                cx.new(|_| root)
            },
        );
    });
}
