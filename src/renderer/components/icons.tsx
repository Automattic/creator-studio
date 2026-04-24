import React from 'react';

type IconProps = {
	size?: number;
	className?: string;
};

const baseProps = {
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.5,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
};

export function TasksIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 20 20"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<rect x="3" y="3" width="14" height="14" rx="3" />
			<path d="m6.5 10 2.5 2.5L14 7.5" />
		</svg>
	);
}

export function DraftsIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 20 20"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<path d="m12.5 3.5 4 4L8 16H4v-4l8.5-8.5Z" />
			<path d="m11 5 4 4" />
		</svg>
	);
}

export function PlusIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 20 20"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<path d="M10 4.5v11M4.5 10h11" />
		</svg>
	);
}

export function FolderIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 20 20"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<path d="M2.5 6.25A1.75 1.75 0 0 1 4.25 4.5h3.1a1.75 1.75 0 0 1 1.24.51l1 1a1.75 1.75 0 0 0 1.24.51h4.92A1.75 1.75 0 0 1 17.5 8.27v6.48a1.75 1.75 0 0 1-1.75 1.75H4.25A1.75 1.75 0 0 1 2.5 14.75V6.25Z" />
		</svg>
	);
}

export function FolderPlusIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 20 20"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<path d="M2.5 6.25A1.75 1.75 0 0 1 4.25 4.5h3.1a1.75 1.75 0 0 1 1.24.51l1 1a1.75 1.75 0 0 0 1.24.51h4.92A1.75 1.75 0 0 1 17.5 8.27v6.48a1.75 1.75 0 0 1-1.75 1.75H4.25A1.75 1.75 0 0 1 2.5 14.75V6.25Z" />
			<path d="M10 9.75v4.5M7.75 12h4.5" />
		</svg>
	);
}

export function SidebarToggleIcon( {
	size = 16,
	className,
}: IconProps ): React.ReactElement {
	return (
		<svg
			width={ size }
			height={ size }
			viewBox="0 0 20 20"
			className={ className }
			aria-hidden="true"
			{ ...baseProps }
		>
			<rect x="2.5" y="4" width="15" height="12" rx="2.25" />
			<path d="M7.75 4.25v11.5" />
		</svg>
	);
}
