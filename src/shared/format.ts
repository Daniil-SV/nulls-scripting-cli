export function formatPublishDate(date: string | null) {
	return date ? `published ${date.slice(0, 10)}` : "draft";
}

export function formatUpdateDate(date: string) {
	return `updated ${date.slice(0, 10)}`;
}

export function formatCreateDate(date: string) {
	return `created ${date.slice(0, 10)}`;
}
