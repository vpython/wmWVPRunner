export function parseGlowScriptVersion(firstLine: string): string {
	const match = firstLine.match(/GlowScript\s+([\d.]+)/)
	return match ? match[1] : '3.2'
}
