package com.phonebridge.connection

import android.util.Base64
import android.util.Log
import java.security.*
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

private const val TAG = "SecurityUtils"

object SecurityUtils {

    // Generate EC P-256 KeyPair
    fun generateKeyPair(): KeyPair? {
        return try {
            val keyPairGen = KeyPairGenerator.getInstance("EC")
            keyPairGen.initialize(ECGenParameterSpec("secp256r1"))
            keyPairGen.generateKeyPair()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate EC KeyPair", e)
            null
        }
    }

    // Get Base64 encoded SPKI public key
    fun getPublicKeyBase64(keyPair: KeyPair): String {
        val encoded = keyPair.public.encoded
        return Base64.encodeToString(encoded, Base64.NO_WRAP)
    }

    // Derive Shared Secret using ECDH and digest it with SHA-256 to form a 32-byte AES key
    fun deriveSharedSecret(privateKey: PrivateKey, peerPublicKeyBase64: String): ByteArray? {
        return try {
            val peerKeyBytes = Base64.decode(peerPublicKeyBase64, Base64.DEFAULT)
            val keyFactory = KeyFactory.getInstance("EC")
            val peerPublicKey = keyFactory.generatePublic(X509EncodedKeySpec(peerKeyBytes))

            val keyAgreement = KeyAgreement.getInstance("ECDH")
            keyAgreement.init(privateKey)
            keyAgreement.doPhase(peerPublicKey, true)

            val sharedSecret = keyAgreement.generateSecret()
            val md = MessageDigest.getInstance("SHA-256")
            md.digest(sharedSecret)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to derive shared secret", e)
            null
        }
    }

    // Encrypt payload using AES-256-GCM
    fun encryptAES_GCM(plaintext: String, aesKey: ByteArray): Map<String, String>? {
        return try {
            val iv = ByteArray(12)
            SecureRandom().nextBytes(iv)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val keySpec = SecretKeySpec(aesKey, "AES")
            val gcmSpec = GCMParameterSpec(128, iv)
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)

            val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

            val ivBase64 = Base64.encodeToString(iv, Base64.NO_WRAP)
            val ciphertextBase64 = Base64.encodeToString(ciphertext, Base64.NO_WRAP)

            mapOf("iv" to ivBase64, "ciphertext" to ciphertextBase64)
        } catch (e: Exception) {
            Log.e(TAG, "Encryption failed", e)
            null
        }
    }

    // Decrypt payload using AES-256-GCM
    fun decryptAES_GCM(ciphertextBase64: String, ivBase64: String, aesKey: ByteArray): String? {
        return try {
            val iv = Base64.decode(ivBase64, Base64.DEFAULT)
            val ciphertext = Base64.decode(ciphertextBase64, Base64.DEFAULT)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val keySpec = SecretKeySpec(aesKey, "AES")
            val gcmSpec = GCMParameterSpec(128, iv)
            cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)

            val decryptedBytes = cipher.doFinal(ciphertext)
            String(decryptedBytes, Charsets.UTF_8)
        } catch (e: Exception) {
            Log.e(TAG, "Decryption failed", e)
            null
        }
    }
}
