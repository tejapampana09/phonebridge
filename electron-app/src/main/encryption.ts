import * as crypto from 'crypto'

export interface KeyPairResult {
  publicKeyBase64: string
  privateKey: crypto.KeyObject
}

// Generate EC P-256 (prime256v1) key pair
export function generateECKeyPair(): KeyPairResult {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: {
      type: 'spki',
      format: 'der'
    }
  })

  return {
    publicKeyBase64: publicKey.toString('base64'),
    privateKey
  }
}

// Derive a 32-byte AES key using SHA-256 on the ECDH shared secret
export function deriveAESKey(privateKey: crypto.KeyObject, peerPublicKeyDerBase64: string): Buffer {
  const peerKey = crypto.createPublicKey({
    key: Buffer.from(peerPublicKeyDerBase64, 'base64'),
    format: 'der',
    type: 'spki'
  })

  const sharedSecret = crypto.diffieHellman({
    privateKey,
    publicKey: peerKey
  })

  return crypto.createHash('sha256').update(sharedSecret).digest()
}

// Encrypt payload using AES-256-GCM (with authentication tag appended to ciphertext)
export function encryptAES_GCM(plaintext: string, aesKey: Buffer): { iv: string; ciphertext: string } {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv)
  
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()
  const ciphertextWithTag = Buffer.concat([ciphertext, tag])

  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertextWithTag.toString('base64')
  }
}

// Decrypt payload using AES-256-GCM (extract tag from end of ciphertext)
export function decryptAES_GCM(ciphertextBase64: string, ivBase64: string, aesKey: Buffer): string {
  const iv = Buffer.from(ivBase64, 'base64')
  const ciphertextWithTag = Buffer.from(ciphertextBase64, 'base64')
  
  if (ciphertextWithTag.length < 16) {
    throw new Error('Ciphertext too short (missing GCM tag)')
  }

  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16)
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ])

  return decrypted.toString('utf8')
}
