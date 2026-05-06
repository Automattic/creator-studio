import React, { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// `ResourcePreview` already sets this; assigning again is a no-op but lets
// this component be loaded independently (e.g. into search-result panels)
// without depending on the preview module having mounted first.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Width chosen to comfortably fill a card body at common Retina densities
// without inflating the saved PNG; pages render to a canvas at this CSS
// width and we save the resulting bitmap as-is.
const THUMBNAIL_WIDTH = 320;

type Props = {
	projectId: string;
	folder: string;
	relPath: string;
	name: string;
	mtime: number | undefined;
	// Project-relative path to a previously-cached thumbnail. When set, we
	// just render an <img> against the asset protocol — the expensive PDF
	// parse is skipped entirely.
	existingThumbPath?: string;
};

export function PdfThumbnail( {
	projectId,
	folder,
	relPath,
	name,
	mtime,
	existingThumbPath,
}: Props ): React.ReactElement | null {
	// `savedThumbPath` is the project-relative path to the cached PNG. On
	// first visit it starts null and gets filled in after the IPC save
	// completes; on revisits the parent already passes one in via
	// `existingThumbPath`, so we never re-parse the PDF.
	const [ savedThumbPath, setSavedThumbPath ] = useState< string | null >(
		existingThumbPath ?? null
	);
	const [ failed, setFailed ] = useState( false );
	const captureRef = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		setSavedThumbPath( existingThumbPath ?? null );
		setFailed( false );
	}, [ projectId, folder, relPath, mtime, existingThumbPath ] );

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

	const onRenderSuccess = async (): Promise< void > => {
		const canvas = captureRef.current?.querySelector( 'canvas' );
		if ( ! canvas || mtime === undefined ) {
			return;
		}
		const dataUrl = canvas.toDataURL( 'image/png' );
		const b64 = dataUrl.replace( /^data:image\/png;base64,/, '' );
		try {
			const result = await window.api.resources.saveThumb(
				projectId,
				folder,
				relPath,
				mtime,
				b64
			);
			if ( result.ok ) {
				// Swap to the persisted asset URL. Avoids handing the <img>
				// a 200KB+ data: URL, which Chromium decodes erratically when
				// many cards are mounting at once.
				setSavedThumbPath( result.thumbPath );
			}
		} catch {
			// Best-effort: leave the card without a thumb until the next
			// listFiles refresh picks the file up.
		}
	};

	const onError = async (): Promise< void > => {
		setFailed( true );
		if ( mtime === undefined ) {
			return;
		}
		try {
			await window.api.resources.markThumbFailed(
				projectId,
				folder,
				relPath,
				mtime
			);
		} catch {
			// If marking the failure can't be persisted, the next mount
			// will retry the parse — acceptable.
		}
	};

	return (
		<div
			ref={ captureRef }
			className="resources-grid-card-thumb-capture"
			aria-hidden="true"
		>
			<Document
				file={ sourceUrl }
				onLoadError={ onError }
				loading={ null }
				error={ null }
				noData={ null }
			>
				<Page
					pageNumber={ 1 }
					width={ THUMBNAIL_WIDTH }
					renderTextLayer={ false }
					renderAnnotationLayer={ false }
					onRenderSuccess={ onRenderSuccess }
					onRenderError={ onError }
				/>
			</Document>
		</div>
	);
}
