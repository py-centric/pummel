use crate::PummelRootView;
use crate::state::ActiveTab;
use gpui::{
    AnyElement, Context, InteractiveElement, IntoElement, ParentElement, PathPromptOptions,
    SharedString, StatefulInteractiveElement, Styled, div, px, rgb,
};
use pummel::engine::projects::SessionRunStatus;

pub fn render_workspace_sidebar(
    view: &PummelRootView,
    cx: &mut Context<PummelRootView>,
) -> AnyElement {
    let active_session_id = view.state.active_session_id.clone();
    let attached_ids: Vec<String> = view
        .state
        .active_session()
        .map(|s| s.project_ids.clone())
        .unwrap_or_default();

    // 1. Sessions Section (Antigravity / OpenCode Desktop style)
    let mut session_rows = div().flex().flex_col().gap_1();
    for sess in &view.state.workspace_sessions {
        let sid = sess.id.clone();
        let is_active = sess.id == active_session_id;
        let (badge_text, badge_color) = match sess.run_status {
            SessionRunStatus::Idle => ("IDLE", rgb(0x475569)),
            SessionRunStatus::Running => ("RUN", rgb(0x16a34a)),
            SessionRunStatus::Completed => ("OK", rgb(0x0f766e)),
            SessionRunStatus::Aborted => ("STOP", rgb(0xd97706)),
            SessionRunStatus::Failed => ("ERR", rgb(0xdc2626)),
        };

        session_rows = session_rows.child(
            div()
                .id(SharedString::from(format!("sess-{}", sess.id)))
                .flex()
                .items_center()
                .justify_between()
                .px_2()
                .py_1()
                .rounded_md()
                .bg(if is_active {
                    rgb(0x2563eb)
                } else {
                    rgb(0x0f172a)
                })
                .text_color(rgb(0xf8fafc))
                .cursor_pointer()
                .child(SharedString::from(format!(
                    "{} ({}p)",
                    sess.name,
                    sess.project_ids.len()
                )))
                .child(
                    div()
                        .px_1()
                        .rounded_sm()
                        .bg(badge_color)
                        .text_color(rgb(0xf8fafc))
                        .child(SharedString::from(badge_text)),
                )
                .on_click(cx.listener(move |this, _ev, _win, cx| {
                    this.state.switch_session(&sid);
                    cx.notify();
                })),
        );
    }

    // 2. Registered Projects Section (Multi-Project Roots)
    let mut project_rows = div().flex().flex_col().gap_1();
    for proj in &view.state.projects {
        let pid = proj.id.clone();
        let is_attached = attached_ids.contains(&proj.id);
        project_rows = project_rows.child(
            div()
                .flex()
                .flex_col()
                .gap_1()
                .p_2()
                .rounded_md()
                .bg(rgb(0x0f172a))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(SharedString::from(proj.name.clone()))
                        .child(
                            div()
                                .id(SharedString::from(format!("attach-{}", proj.id)))
                                .px_2()
                                .py_0p5()
                                .rounded_sm()
                                .bg(if is_attached {
                                    rgb(0x16a34a)
                                } else {
                                    rgb(0x334155)
                                })
                                .text_color(rgb(0xf8fafc))
                                .cursor_pointer()
                                .child(SharedString::from(if is_attached {
                                    "Attached"
                                } else {
                                    "+ Attach"
                                }))
                                .on_click(cx.listener(move |this, _ev, _win, cx| {
                                    if is_attached {
                                        this.state.detach_project_from_active_session(&pid);
                                    } else {
                                        this.state.attach_project_to_active_session(&pid);
                                    }
                                    cx.notify();
                                })),
                        ),
                )
                .child(
                    div()
                        .text_color(rgb(0x94a3b8))
                        .child(SharedString::from(proj.root_path.clone())),
                ),
        );
    }

    // 3. Auto-Discovered Scenarios Across Active Session's Project Roots
    let mut scenario_rows = div().flex().flex_col().gap_1();
    for sc in view.state.discovered_scenarios.iter().take(12) {
        let abs = sc.absolute_path.clone();
        scenario_rows = scenario_rows.child(
            div()
                .id(SharedString::from(format!(
                    "sc-{}-{}",
                    sc.project_id, sc.relative_path
                )))
                .px_2()
                .py_1()
                .rounded_md()
                .bg(rgb(0x0f172a))
                .text_color(rgb(0xe2e8f0))
                .cursor_pointer()
                .child(SharedString::from(format!(
                    "{}/{}",
                    sc.project_name, sc.relative_path
                )))
                .on_click(cx.listener(move |this, _ev, _win, cx| {
                    this.state.load_discovered_scenario(&abs);
                    this.state.active_tab = ActiveTab::Workspace;
                    cx.notify();
                })),
        );
    }

    div()
        .flex()
        .flex_col()
        .w(px(290.0))
        .h_full()
        .p_3()
        .gap_4()
        .bg(rgb(0x1e293b))
        .child(
            div()
                .flex()
                .flex_col()
                .gap_2()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(SharedString::from("SESSIONS"))
                        .child(
                            div()
                                .id("btn-new-session")
                                .px_2()
                                .py_0p5()
                                .rounded_md()
                                .bg(rgb(0x2563eb))
                                .text_color(rgb(0xf8fafc))
                                .cursor_pointer()
                                .child(SharedString::from("+ New"))
                                .on_click(cx.listener(|this, _ev, _win, cx| {
                                    let idx = this.state.workspace_sessions.len() + 1;
                                    let ids: Vec<String> =
                                        this.state.projects.iter().map(|p| p.id.clone()).collect();
                                    this.state
                                        .create_workspace_session(format!("Session #{idx}"), ids);
                                    cx.notify();
                                })),
                        ),
                )
                .child(session_rows),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap_2()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(SharedString::from("PROJECTS"))
                        .child(
                            div()
                                .id("btn-add-project-folder")
                                .px_2()
                                .py_0p5()
                                .rounded_md()
                                .bg(rgb(0x0f766e))
                                .text_color(rgb(0xf8fafc))
                                .cursor_pointer()
                                .child(SharedString::from("+ Folder"))
                                .on_click(cx.listener(|_this, _ev, _win, cx| {
                                    let receiver = cx.prompt_for_paths(PathPromptOptions {
                                        files: false,
                                        directories: true,
                                        multiple: true,
                                        prompt: Some(SharedString::from(
                                            "Select Pummel Project Folder(s)",
                                        )),
                                    });
                                    cx.spawn(async move |this, cx| {
                                        if let Ok(Ok(Some(paths))) = receiver.await {
                                            let _ = this.update(cx, |root, cx| {
                                                for path in paths {
                                                    root.state.register_project_dir(&path);
                                                }
                                                cx.notify();
                                            });
                                        }
                                    })
                                    .detach();
                                })),
                        ),
                )
                .child(project_rows),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap_2()
                .child(SharedString::from(format!(
                    "SCENARIOS ({})",
                    view.state.discovered_scenarios.len()
                )))
                .child(scenario_rows),
        )
        .into_any_element()
}
