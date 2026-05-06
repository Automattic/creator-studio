import React, { useEffect, useRef, useState } from 'react';

// Width chosen to match `PdfThumbnail` so saved PNGs have a consistent
// presentation size. Heights vary with the source aspect ratio.
const THUMBNAIL_WIDTH = 320;

// If the video metadata loads but `seeked` never fires (DRM, broken
// container, codec the renderer can't actually decode despite the
// `loadedmetadata` event firing), bail rather than holding the element
// alive forever. 8s is comfortably more than enough for any local file.
const SEEK_FALLBACK_MS = 8000;

type Props = {
	projectId: string;
	folder: string;
	relPath: string;
	name: string;
	mtime: number | undefined;
	existingThumbPath?: string;
};

export function VideoThumbnail( {
	projectId,
	folder,
	relPath,
	name,
	mtime,
	existingThumbPath,
}: Props ): React.ReactElement | null {
	const [ savedThumbPath, setSavedThumbPath ] = useState< string | null >(
		existingThumbPath ?? null
	);
	const [ failed, setFailed ] = useState( false );
	const videoRef = useRef< HTMLVideoElement | null >( null );

	useEffect( () => {
		setSavedThumbPath( existingThumbPath ?? null );
		setFailed( false );
	}, [ projectId, folder, relPath, mtime, existingThumbPath ] );

	useEffect( () => {
		if ( savedThumbPath || failed || mtime === undefined ) {
			return;
		}
		const video = videoRef.current;
		if ( ! video ) {
			return;
		}

		let cancelled = false;
		// Once we either capture a frame or mark the file failed, we ignore
		// every subsequent event. Without this guard, an `error` event that
		// fires after a successful `seeked` would re-trigger the fail path.
		let settled = false;

		const markFailed = async (): Promise< void > => {
			if ( cancelled || settled ) {
				return;
			}
			settled = true;
			setFailed( true );
			try {
				await window.api.resources.markThumbFailed(
					projectId,
					folder,
					relPath,
					mtime
				);
			} catch {
				// Best-effort marker; the next mount will retry the capture.
			}
		};

		const capture = async (): Promise< void > => {
			if ( cancelled || settled ) {
				return;
			}
			const w = video.videoWidth;
			const h = video.videoHeight;
			if ( ! w || ! h ) {
				await markFailed();
				return;
			}
			settled = true;
			const scale = THUMBNAIL_WIDTH / w;
			const canvas = document.createElement( 'canvas' );
			canvas.width = THUMBNAIL_WIDTH;
			canvas.height = Math.max( 1, Math.round( h * scale ) );
			const ctx = canvas.getContext( '2d' );
			if ( ! ctx ) {
				await markFailed();
				return;
			}
			try {
				ctx.drawImage( video, 0, 0, canvas.width, canvas.height );
			} catch {
				// drawImage throws on tainted (cross-origin) sources; the
				// studio-asset:// protocol is registered as privileged so this
				// shouldn't happen, but treating it as a failure is safer
				// than crashing the card.
				await markFailed();
				return;
			}
			let dataUrl: string;
			try {
				dataUrl = canvas.toDataURL( 'image/png' );
			} catch {
				await markFailed();
				return;
			}
			const b64 = dataUrl.replace( /^data:image\/png;base64,/, '' );
			try {
				const result = await window.api.resources.saveThumb(
					projectId,
					folder,
					relPath,
					mtime,
					b64
				);
				if ( ! cancelled && result.ok ) {
					setSavedThumbPath( result.thumbPath );
				}
			} catch {
				// Persistence failure: the next listFiles refresh will retry.
			}
		};

		const onMetadata = (): void => {
			if ( cancelled || settled ) {
				return;
			}
			// Seek a touch in so the very first frame (often a black flash)
			// doesn't end up as the thumbnail. For very short clips, fall
			// back to 10% of the duration so we stay inside the file.
			const candidate = Math.min( video.duration * 0.1, 1 );
			const target =
				Number.isFinite( candidate ) && candidate > 0 ? candidate : 0;
			try {
				video.currentTime = target;
			} catch {
				void markFailed();
			}
		};
		const onSeeked = (): void => {
			void capture();
		};
		const onError = (): void => {
			void markFailed();
		};

		video.addEventListener( 'loadedmetadata', onMetadata );
		video.addEventListener( 'seeked', onSeeked );
		video.addEventListener( 'error', onError );
		const timeoutId = setTimeout( () => {
			void markFailed();
		}, SEEK_FALLBACK_MS );

		return () => {
			cancelled = true;
			clearTimeout( timeoutId );
			video.removeEventListener( 'loadedmetadata', onMetadata );
			video.removeEventListener( 'seeked', onSeeked );
			video.removeEventListener( 'error', onError );
		};
	}, [ savedThumbPath, failed, projectId, folder, relPath, mtime ] );

	if ( savedThumbPath ) {
		const src = `studio-asset://${ projectId }/${ savedThumbPath }`;
		return (
			<img
				className="resources-grid-card-thumb"
				src={ src }
				alt={ name }
				loading="lazy"
				onError={ ( e ) => {
					( e.currentTarget as HTMLImageElement ).style.display =
						'none';
				} }
			/>
		);
	}

	if ( failed ) {
		return null;
	}

	const sourceUrl = `studio-asset://${ projectId }/${ folder }/${ relPath }`;
	return (
		<div className="resources-grid-card-thumb-capture" aria-hidden="true">
			{ /* `preload="metadata"` keeps the request small until we set
			   currentTime; once we seek, Chromium fetches enough of the
			   file to decode the target frame. The asset protocol forwards
			   Range headers, so seeking works without buffering the whole
			   file. */ }
			<video
				ref={ videoRef }
				src={ sourceUrl }
				preload="metadata"
				muted
				playsInline
			/>
		</div>
	);
}
