export type Review = {
  id: string;
  user_id?: string | null;
  photo_url: string | null;
  content: string | null;
  created_at: string;
};
