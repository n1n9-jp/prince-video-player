type Props = {
  title: string;
  meta: string;
  thumbnailUrl?: string;
  active?: boolean;
  onOpen: () => void;
};

export function PlaylistCard({ title, meta, thumbnailUrl, active, onOpen }: Props) {
  return (
    <article className={`video-card playlist-card${active ? " on" : ""}`}>
      <button type="button" className="video-thumb" onClick={onOpen}>
        {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <span className="playlist-card-empty" />}
      </button>
      <div className="video-card-body">
        <h3>
          <button type="button" onClick={onOpen}>
            {title}
          </button>
        </h3>
        <p>{meta}</p>
      </div>
    </article>
  );
}

export function playlistCoverUrl(
  videoIds: string[],
  videos: Record<string, { thumbnailUrl: string }>,
): string | undefined {
  for (const id of videoIds) {
    const url = videos[id]?.thumbnailUrl;
    if (url) return url;
  }
  return undefined;
}
