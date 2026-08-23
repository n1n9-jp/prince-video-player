import type { ReactNode } from "react";
import type { VideoTagging } from "../catalog/types";
import type { Video } from "../storage/types";
import { TagRow } from "./TagRow";

type Props = {
  video: Video;
  meta?: string;
  tagging?: VideoTagging;
  editableTags?: boolean;
  actions?: ReactNode;
  onOpen: () => void;
  onAddSong?: (songId: string) => void;
  onRemoveSong?: (songId: string) => void;
};

export function VideoCard({ video, meta, tagging, editableTags, actions, onOpen, onAddSong, onRemoveSong }: Props) {
  return (
    <article className="video-card">
      <button type="button" className="video-thumb" onClick={onOpen}>
        <img src={video.thumbnailUrl} alt="" />
      </button>
      <div className="video-card-body">
        <h3>
          <button type="button" onClick={onOpen}>
            {video.title}
          </button>
        </h3>
        <p>{video.channelTitle}</p>
        {meta ? <p className="video-card-sub">{meta}</p> : null}
        <TagRow
          tagging={tagging}
          editable={editableTags}
          compact
          onAddSong={onAddSong}
          onRemoveSong={onRemoveSong}
        />
        {actions ? <div className="video-card-actions">{actions}</div> : null}
      </div>
    </article>
  );
}
