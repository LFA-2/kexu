// Tells the assignee's devices that they have a new task.
// The assigner's browser calls this right after the task row is inserted; the
// service role is needed because nobody may read someone else's subscriptions.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const subject = Deno.env.get("VAPID_SUBJECT");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!subject || !publicKey || !privateKey) return json({ error: "vapid keys missing" }, 500);
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: caller } = await admin.auth.getUser(authorization.replace(/^Bearer /, ""));
  const callerId = caller.user?.id;
  if (!callerId) return json({ error: "unauthorized" }, 401);

  let taskId = NaN;
  try {
    taskId = Number(((await req.json()) as { task_id?: unknown }).task_id);
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!Number.isInteger(taskId)) return json({ error: "bad request" }, 400);

  const { data: task } = await admin
    .from("tasks")
    .select("id, title, created_by, assignee")
    .eq("id", taskId)
    .single();
  // Only the assigner announces their own task, so a caller cannot push anything else.
  if (!task || task.created_by !== callerId) return json({ error: "forbidden" }, 403);

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", callerId)
    .single();

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", task.assignee);
  if (!subs?.length) return json({ sent: 0 });

  const payload = JSON.stringify({
    title: "有新任務",
    body: `${profile?.display_name?.trim() || "對方"}指派了「${task.title}」`,
    tag: `task-${task.id}`,
  });

  const stale: number[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        // 404/410: the app was deleted or its data cleared, so drop the subscription.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(sub.id);
        else console.error("push failed", status, err);
      }
    }),
  );
  if (stale.length) await admin.from("push_subscriptions").delete().in("id", stale);

  return json({ sent });
});
