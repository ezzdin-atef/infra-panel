import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isSSHPort } from './ufw.js'

describe('isSSHPort', () => {
  test('returns true for port 22', () => {
    assert.ok(isSSHPort(22))
    assert.ok(isSSHPort('22'))
  })

  test('returns true for 22/tcp', () => {
    assert.ok(isSSHPort('22/tcp'))
  })

  test('returns false for other ports', () => {
    assert.ok(!isSSHPort(80))
    assert.ok(!isSSHPort('443'))
    assert.ok(!isSSHPort('8022'))
  })
})
