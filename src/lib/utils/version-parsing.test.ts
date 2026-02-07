import { describe, it, expect } from 'vitest'
import { parseGlowScriptVersion } from './parseVersion'

describe('parseGlowScriptVersion', () => {
	it('parses "GlowScript 3.2 VPython"', () => {
		expect(parseGlowScriptVersion('GlowScript 3.2 VPython')).toBe('3.2')
	})

	it('parses "GlowScript 3.10 VPython"', () => {
		expect(parseGlowScriptVersion('GlowScript 3.10 VPython')).toBe('3.10')
	})

	it('parses version without VPython suffix', () => {
		expect(parseGlowScriptVersion('GlowScript 2.7')).toBe('2.7')
	})

	it('falls back to 3.2 for non-matching line', () => {
		expect(parseGlowScriptVersion('# some other line')).toBe('3.2')
	})

	it('falls back to 3.2 for empty string', () => {
		expect(parseGlowScriptVersion('')).toBe('3.2')
	})
})
