use crate::PummelRootView;
use gpui::{
    AnyElement, Context, InteractiveElement, IntoElement, ParentElement, SharedString,
    StatefulInteractiveElement, Styled, div, rgb,
};

pub fn render_cluster_view(view: &PummelRootView, cx: &mut Context<PummelRootView>) -> AnyElement {
    let workers = view.state.workers();
    let auto_scale = view.state.auto_scale_decision();
    let (quorum_ok, strategy, auto_scale_enabled) = {
        let c = view
            .state
            .control_plane
            .cluster
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        (c.quorum_satisfied(), c.shard_strategy, c.auto_scale.enabled)
    };

    let total_vus: usize = workers.iter().map(|w| w.assigned_vus).sum();
    let total_rps: f64 = workers.iter().map(|w| w.current_rps).sum();

    let mut worker_rows = div().flex().flex_col().gap_2();
    for w in workers {
        let wid = w.id.clone();
        worker_rows = worker_rows.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .p_2()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from(format!(
                    "{} ({}) — {} | Status: {:?} | VUs: {} | RPS: {:.1} | CPU: {:.0}%",
                    w.id,
                    w.region,
                    w.endpoint,
                    w.status,
                    w.assigned_vus,
                    w.current_rps,
                    w.cpu_usage_pct
                )))
                .child(
                    div()
                        .id(SharedString::from(format!("rm-{}", w.id)))
                        .px_2()
                        .py_1()
                        .rounded_md()
                        .bg(rgb(0x991b1b))
                        .text_color(rgb(0xf8fafc))
                        .cursor_pointer()
                        .child(SharedString::from("Remove"))
                        .on_click(cx.listener(move |this, _ev, _win, cx| {
                            this.state.remove_worker(&wid);
                            cx.notify();
                        })),
                ),
        );
    }

    div()
        .flex()
        .flex_col()
        .gap_4()
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(SharedString::from(format!(
                    "Cluster Overview — Quorum: {} | Strategy: {:?} | Assigned VUs: {} | Total RPS: {:.1}",
                    if quorum_ok { "SATISFIED" } else { "DEGRADED" },
                    strategy,
                    total_vus,
                    total_rps
                )))
                .child(
                    div()
                        .flex()
                        .gap_2()
                        .child(
                            div()
                                .id("btn-add-worker")
                                .px_3()
                                .py_1()
                                .rounded_md()
                                .bg(rgb(0x2563eb))
                                .text_color(rgb(0xf8fafc))
                                .cursor_pointer()
                                .child(SharedString::from("+ Add Worker"))
                                .on_click(cx.listener(|this, _ev, _win, cx| {
                                    this.state.add_worker("eu-west-1");
                                    cx.notify();
                                })),
                        )
                        .child(
                            div()
                                .id("btn-toggle-shard")
                                .px_3()
                                .py_1()
                                .rounded_md()
                                .bg(rgb(0x334155))
                                .text_color(rgb(0xf8fafc))
                                .cursor_pointer()
                                .child(SharedString::from("Toggle Shard Strategy"))
                                .on_click(cx.listener(|this, _ev, _win, cx| {
                                    this.state.toggle_shard_strategy();
                                    cx.notify();
                                })),
                        )
                        .child(
                            div()
                                .id("btn-toggle-autoscale")
                                .px_3()
                                .py_1()
                                .rounded_md()
                                .bg(if auto_scale_enabled {
                                    rgb(0x16a34a)
                                } else {
                                    rgb(0x475569)
                                })
                                .text_color(rgb(0xf8fafc))
                                .cursor_pointer()
                                .child(SharedString::from(if auto_scale_enabled {
                                    "Auto-Scale: ON"
                                } else {
                                    "Auto-Scale: OFF"
                                }))
                                .on_click(cx.listener(|this, _ev, _win, cx| {
                                    this.state.toggle_auto_scale();
                                    cx.notify();
                                })),
                        ),
                ),
        )
        .child(
            div()
                .p_3()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from(format!(
                    "Auto-Scale Policy Decision: {:?} (target {} workers) — {}",
                    auto_scale.action, auto_scale.target_worker_count, auto_scale.reason
                ))),
        )
        .child(worker_rows)
        .into_any_element()
}
