export type SongKind = "official" | "unreleased" | "cover" | "laterReleased";
export type MatchConfidence = "high" | "medium" | "low";
export type ConcertConfidence = "confirmed" | "partial" | "unknown";
export type ReleaseType = "album" | "single" | "ep" | "compilation" | "soundtrack";
export type TagSource = "auto" | "manual";

export type Song = {
  id: string;
  title: string;
  aliases: string[];
  kind: SongKind;
  firstReleaseId?: string;
  year?: number;
  sourceUrl?: string;
  confidence: MatchConfidence;
};

export type ReleaseTrack = {
  songId: string;
  position: number;
};

export type Release = {
  id: string;
  title: string;
  type: ReleaseType;
  date?: string;
  tracks: ReleaseTrack[];
  mbid?: string;
};

export type ConcertSetItem = {
  songId: string;
  order: number;
};

export type Concert = {
  id: string;
  date: string;
  venue: string;
  city?: string;
  tour?: string;
  aliases: string[];
  setlist: ConcertSetItem[];
  confidence: ConcertConfidence;
  sourceUrl?: string;
};

export type VideoTagging = {
  songIds: string[];
  releaseIds: string[];
  concertId?: string;
  source: TagSource;
  confidence: MatchConfidence;
};

export type Catalog = {
  songs: Song[];
  releases: Release[];
  concerts: Concert[];
};
