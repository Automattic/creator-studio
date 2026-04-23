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

export function ChatIcon( {
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
			<path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H8.5l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5Z" />
		</svg>
	);
}

export function SettingsIcon( {
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
			<circle cx="10" cy="10" r="3" />
			<path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.55 1.55M14.15 14.15l1.55 1.55M4.3 15.7l1.55-1.55M14.15 5.85 15.7 4.3" />
		</svg>
	);
}

export function SkillsIcon( {
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
			<path d="M2.5 4.5h5.25a2 2 0 0 1 2 2V16a1.75 1.75 0 0 0-1.75-1.75H2.5V4.5Z" />
			<path d="M17.5 4.5h-5.25a2 2 0 0 0-2 2V16a1.75 1.75 0 0 1 1.75-1.75h5.5V4.5Z" />
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
