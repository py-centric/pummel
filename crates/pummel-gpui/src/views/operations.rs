use crate::PummelRootView;
use gpui::{
    AnyElement, Context, InteractiveElement, IntoElement, ParentElement, SharedString,
    StatefulInteractiveElement, Styled, div, rgb,
};
use pummel::engine::scheduler::ScheduleRecurrence;
use pummel::engine::webhooks::WebhookProvider;

pub fn render_operations_view(
    view: &PummelRootView,
    cx: &mut Context<PummelRootView>,
) -> AnyElement {
    let mut sched_list = div().flex().flex_col().gap_2();
    for s in &view.state.schedules {
        let sid = s.id.clone();
        sched_list = sched_list.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .p_2()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from(format!(
                    "{} — {:?} | Next: {} | Runs: {} | Status: {:?}",
                    s.name,
                    s.recurrence,
                    s.next_run_at.format("%Y-%m-%d %H:%M UTC"),
                    s.run_count,
                    s.status
                )))
                .child(
                    div()
                        .id(SharedString::from(format!("del-sched-{}", s.id)))
                        .px_2()
                        .py_1()
                        .rounded_md()
                        .bg(rgb(0x991b1b))
                        .text_color(rgb(0xf8fafc))
                        .cursor_pointer()
                        .child(SharedString::from("Delete"))
                        .on_click(cx.listener(move |this, _ev, _win, cx| {
                            this.state.delete_schedule(&sid);
                            cx.notify();
                        })),
                ),
        );
    }

    let mut hook_list = div().flex().flex_col().gap_2();
    for h in &view.state.webhooks {
        let hid = h.id.clone();
        hook_list = hook_list.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .p_2()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from(format!(
                    "{} ({:?}) — {} | Enabled: {}",
                    h.name, h.provider, h.url, h.enabled
                )))
                .child(
                    div()
                        .id(SharedString::from(format!("del-hook-{}", h.id)))
                        .px_2()
                        .py_1()
                        .rounded_md()
                        .bg(rgb(0x991b1b))
                        .text_color(rgb(0xf8fafc))
                        .cursor_pointer()
                        .child(SharedString::from("Delete"))
                        .on_click(cx.listener(move |this, _ev, _win, cx| {
                            this.state.delete_webhook(&hid);
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
                .child(SharedString::from("Scheduled Load Tests (SQLite Backed)"))
                .child(
                    div()
                        .id("btn-add-schedule")
                        .px_3()
                        .py_1()
                        .rounded_md()
                        .bg(rgb(0x2563eb))
                        .text_color(rgb(0xf8fafc))
                        .cursor_pointer()
                        .child(SharedString::from("+ Schedule Hourly Run"))
                        .on_click(cx.listener(|this, _ev, _win, cx| {
                            let idx = this.state.schedules.len() + 1;
                            this.state.add_schedule(
                                format!("Hourly Smoke #{idx}"),
                                ScheduleRecurrence::Hourly,
                            );
                            cx.notify();
                        })),
                ),
        )
        .child(sched_list)
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(SharedString::from("Webhook Integrations & Alerting"))
                .child(
                    div()
                        .id("btn-add-webhook")
                        .px_3()
                        .py_1()
                        .rounded_md()
                        .bg(rgb(0x0f766e))
                        .text_color(rgb(0xf8fafc))
                        .cursor_pointer()
                        .child(SharedString::from("+ Add Local Webhook"))
                        .on_click(cx.listener(|this, _ev, _win, cx| {
                            let idx = this.state.webhooks.len() + 1;
                            this.state.add_webhook(
                                format!("Local Alert Hook #{idx}"),
                                WebhookProvider::Generic,
                                "http://127.0.0.1:9000/pummel-alerts".to_string(),
                            );
                            cx.notify();
                        })),
                ),
        )
        .child(hook_list)
        .into_any_element()
}
