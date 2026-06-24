import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { encrypt, decrypt } from './crypto.js'

const SECRET = 'test-secret-key-at-least-32-chars-long!!'

describe('crypto', () => {
  test('encrypt then decrypt returns original plaintext', () => {
    const plaintext = 'hello world'
    const ciphertext = encrypt(plaintext, SECRET)
    const result = decrypt(ciphertext, SECRET)
    assert.equal(result, plaintext)
  })

  test('encrypt produces different ciphertext each time (random IV)', () => {
    const plaintext = 'same input'
    const a = encrypt(plaintext, SECRET)
    const b = encrypt(plaintext, SECRET)
    assert.notEqual(a, b)
  })

  test('decrypt throws on tampered ciphertext', () => {
    const ciphertext = encrypt('original', SECRET)
    const buf = Buffer.from(ciphertext, 'base64')
    // Tamper with the encrypted portion (after 32 bytes of iv+tag)
    if (buf.length > 33) buf[32] = buf[32]! ^ 0xff
    const tampered = buf.toString('base64')
    assert.throws(() => decrypt(tampered, SECRET))
  })

  test('decrypt throws on wrong secret', () => {
    const ciphertext = encrypt('secret data', SECRET)
    assert.throws(() => decrypt(ciphertext, 'wrong-secret-key-at-least-32-chars!'))
  })
})
