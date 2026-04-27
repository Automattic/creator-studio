export type IconProps = {
	size?: number;
	className?: string;
};

export const baseProps = {
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.5,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
};
