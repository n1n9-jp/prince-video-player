import type { ReactNode } from "react";
import type { Video } from "../storage/types";

type Props = {
  video: Video;
  meta?: string;
  actions?: ReactNode;
  onOpen: () => void;
};

export function VideoCard({ video, meta, actions, onOpen }: Props) {
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
        {actions ? <div className="video-card-actions">{actions}</div> : null}
      </div>
    </article>
  );
}
