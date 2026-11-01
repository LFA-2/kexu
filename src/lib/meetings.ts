import { supabase } from "@/lib/supabase";

export type MeetingAction = {
  id: string;
  text: string;
  /** user id, or null for "both / unassigned" */
  assignee: string | null;
  done: boolean;
  /** YYYY-MM-DD or "" */
  due: string;
};

export type Meeting = {
  id: number;
  created_by: string;
  partner: string;
  date: string;
  title: string;
  agenda: string;
  notes: string;
  decisions: string;
  actions: MeetingAction[];
  version: number;
  updated_by: string | null;
  updated_at: string;
};

export type MeetingFields = Pick<Meeting, "date" | "title" | "agenda" | "notes" | "decisions" | "actions">;

const COLUMNS =
  "id, created_by, partner, date, title, agenda, notes, decisions, actions, version, updated_by, updated_at";

export async function listMeetings(): Promise<Meeting[] | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select(COLUMNS)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (error) return null;
  return data as Meeting[];
}

export async function getMeeting(id: number): Promise<Meeting | null> {
  const { data, error } = await supabase.from("meetings").select(COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as Meeting;
}

export async function createMeeting(
  me: string,
  partner: string,
  fields: Partial<MeetingFields>,
): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .insert({ created_by: me, partner, ...fields })
    .select(COLUMNS)
    .single();
  if (error) return null;
  return data as Meeting;
}

/**
 * Apply `patch` to the latest copy of the meeting. On a version conflict the
 * patch function is re-run on the newer copy, so concurrent edits to other
 * fields (or other action items) are kept.
 */
export async function saveMeeting(
  base: Meeting,
  patch: (latest: Meeting) => Partial<MeetingFields>,
): Promise<Meeting | null> {
  let current = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("meetings")
      .update({ ...patch(current), version: current.version + 1 })
      .eq("id", current.id)
      .eq("version", current.version)
      .select(COLUMNS);
    if (error) return null;
    if (data && data.length) return data[0] as Meeting;
    const latest = await getMeeting(current.id);
    if (!latest) return null;
    current = latest;
  }
  return null;
}

export async function deleteMeeting(id: number) {
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  return !error;
}
