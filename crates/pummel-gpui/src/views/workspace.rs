use crate::PummelRootView;
use gpui::{
    AnyElement, Context, InteractiveElement, IntoElement, ParentElement, SharedString,
    StatefulInteractiveElement, Styled, div, rgb,
};

pub fn render_workspace_view(
    view: &PummelRootView,
    cx: &mut Context<PummelRootView>,
) -> AnyElement {
    let mut template_bar = div().flex().gap_2();
    for tpl in &view.state.templates {
        let tid = tpl.id.clone();
        let active = view.state.selected_template_id == tpl.id;
        template_bar = template_bar.child(
            div()
                .id(SharedString::from(format!("tpl-{}", tpl.id)))
                .px_2()
                .py_1()
                .rounded_md()
                .bg(if active { rgb(0x2563eb) } else { rgb(0x334155) })
                .text_color(rgb(0xf8fafc))
                .cursor_pointer()
                .child(SharedString::from(tpl.name.clone()))
                .on_click(cx.listener(move |this, _ev, _win, cx| {
                    this.state.load_template(&tid);
                    cx.notify();
                })),
        );
    }

    let mut export_bar = div().flex().gap_2();
    for target in ["k6", "locust", "taurus", "postman", "goose"] {
        let active = view.state.export_target == target;
        export_bar = export_bar.child(
            div()
                .id(SharedString::from(format!("exp-{target}")))
                .px_2()
                .py_1()
                .rounded_md()
                .bg(if active { rgb(0x0f766e) } else { rgb(0x334155) })
                .text_color(rgb(0xf8fafc))
                .cursor_pointer()
                .child(SharedString::from(format!("Export {target}")))
                .on_click(cx.listener(move |this, _ev, _win, cx| {
                    this.state.set_export_target(target);
                    cx.notify();
                })),
        );
    }

    let mut snap_bar = div().flex().gap_2();
    for snap in view.state.snapshots.iter().take(5) {
        let sid = snap.id.clone();
        snap_bar = snap_bar.child(
            div()
                .id(SharedString::from(format!("snap-{}", snap.id)))
                .px_2()
                .py_1()
                .rounded_md()
                .bg(rgb(0x334155))
                .text_color(rgb(0xf8fafc))
                .cursor_pointer()
                .child(SharedString::from(format!("Restore: {}", snap.name)))
                .on_click(cx.listener(move |this, _ev, _win, cx| {
                    this.state.restore_snapshot(&sid);
                    cx.notify();
                })),
        );
    }

    let diag_text = view.state.validation_messages.join("\n");
    let export_preview: String = view
        .state
        .exported_preview
        .lines()
        .take(16)
        .collect::<Vec<_>>()
        .join("\n");

    div()
        .flex()
        .flex_col()
        .gap_3()
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(template_bar)
                .child(
                    div()
                        .flex()
                        .gap_2()
                        .child(
                            div()
                                .id("btn-validate")
                                .px_3()
                                .py_1()
                                .rounded_md()
                                .bg(rgb(0x16a34a))
                                .text_color(rgb(0xf8fafc))
                                .cursor_pointer()
                                .child(SharedString::from("Dry-Run Validate"))
                                .on_click(cx.listener(|this, _ev, _win, cx| {
                                    this.state.validate_active_yaml();
                                    cx.notify();
                                })),
                        )
                        .child(
                            div()
                                .id("btn-save-snap")
                                .px_3()
                                .py_1()
                                .rounded_md()
                                .bg(rgb(0x2563eb))
                                .text_color(rgb(0xf8fafc))
                                .cursor_pointer()
                                .child(SharedString::from("Save Snapshot"))
                                .on_click(cx.listener(|this, _ev, _win, cx| {
                                    let idx = this.state.snapshots.len() + 1;
                                    this.state.save_snapshot(format!("Snapshot #{idx}"));
                                    cx.notify();
                                })),
                        ),
                ),
        )
        .child(snap_bar)
        .child(
            div()
                .p_3()
                .rounded_md()
                .bg(if view.state.validation_ok {
                    rgb(0x14532d)
                } else {
                    rgb(0x7f1d1d)
                })
                .text_color(rgb(0xf8fafc))
                .child(SharedString::from(diag_text)),
        )
        .child(
            div()
                .flex()
                .gap_4()
                .child(
                    div()
                        .flex_1()
                        .p_3()
                        .rounded_md()
                        .bg(rgb(0x1e293b))
                        .child(SharedString::from(view.state.active_yaml.clone())),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(export_bar)
                        .child(
                            div()
                                .p_3()
                                .rounded_md()
                                .bg(rgb(0x1e293b))
                                .child(SharedString::from(export_preview)),
                        ),
                ),
        )
        .into_any_element()
}
