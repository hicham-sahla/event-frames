export interface Note {
  _id: string;
  user: string;
  text: string;
  external_note: boolean;
  created_on: number; // timestamp in milliseconds
  author_id: string;
  author_name: string;
  editor_id: string | null;
  editor_name: string | null;
  updated_on: number | null;
  subject: string | null;
  category: string | null;
  note_category: string | null;
  performed_on: number | null; // timestamp in milliseconds
  tag_numbers: string[] | null;
  version: string | null;
  software_type: string | null;
  stack_replacements: string | null;
  workorder_id: string | null;
  stack_inspections: string | null;
}

export interface NoteDisplay {
  publicId: string; // maps to _id
  name: string; // maps to "note_category created by author_name"
  occurredOn: {
    fullDate: string;
    dateOnly: string;
    timeOnly: string;
    formattedDate: string;
  };
  severity: string; // maps to performed_on formatted date
  text: string; // original note text
  author_name: string;
  note_category: string | null;
}
