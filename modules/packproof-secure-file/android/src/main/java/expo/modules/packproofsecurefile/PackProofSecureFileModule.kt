package expo.modules.packproofsecurefile

import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class PackProofSecureFileModule : Module() {
  private val encryptionKeyAlias = "packproof_offline_evidence_v1"
  private val signingKeyAlias = "packproof_capture_signing_v1"
  private val magic = byteArrayOf(0x50, 0x50, 0x51, 0x31) // PPQ1
  private val formatVersion = 2
  private val bufferSize = 1024 * 1024

  override fun definition() = ModuleDefinition {
    Name("PackProofSecureFile")

    AsyncFunction("encryptFile") { sourceUri: String, destinationUri: String ->
      val source = resolveFile(sourceUri).canonicalFile
      val destination = resolveFile(destinationUri).canonicalFile
      requirePrivateFile(destination)
      require(source.isFile) { "The PackProof encryption source is not a readable file." }
      require(source != destination) { "Source and destination must be different files." }
      ensureParent(destination)
      val temporary = temporarySibling(destination)

      try {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateEncryptionKey())
        val iv = cipher.iv
        require(iv.size in 12..32) { "Android Keystore returned an invalid AES-GCM IV." }
        val header = magic + byteArrayOf(formatVersion.toByte(), iv.size.toByte())
        cipher.updateAAD(header)
        val digest = MessageDigest.getInstance("SHA-256")
        var total = 0L

        BufferedInputStream(FileInputStream(source), bufferSize).use { input ->
          FileOutputStream(temporary).use { fileOutput ->
            BufferedOutputStream(fileOutput, bufferSize).use { output ->
              output.write(header)
              output.write(iv)
              val buffer = ByteArray(bufferSize)
              while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                if (read == 0) continue
                digest.update(buffer, 0, read)
                cipher.update(buffer, 0, read)?.let(output::write)
                total += read
              }
              cipher.doFinal()?.let(output::write)
              output.flush()
              fileOutput.fd.sync()
            }
          }
        }
        replaceWithCommittedFile(temporary, destination)

        mapOf(
          "encryptedPath" to Uri.fromFile(destination).toString(),
          "plaintextSha256" to digest.digest().toHex(),
          "plaintextSizeBytes" to total,
          "encryption" to "ANDROID_KEYSTORE_AES_256_GCM",
          "containerVersion" to formatVersion,
          "authenticatedHeader" to true
        )
      } catch (error: Throwable) {
        temporary.delete()
        throw error
      }
    }

    AsyncFunction("decryptFile") { sourceUri: String, destinationUri: String ->
      val source = resolveFile(sourceUri).canonicalFile
      val destination = resolveFile(destinationUri).canonicalFile
      requirePrivateFile(source)
      requirePrivateFile(destination)
      require(source.isFile) { "The PackProof encrypted source is not a readable file." }
      require(source != destination) { "Source and destination must be different files." }
      ensureParent(destination)
      val temporary = temporarySibling(destination)

      try {
        FileInputStream(source).use { fileInput ->
          val actualMagic = ByteArray(magic.size)
          if (!readFully(fileInput, actualMagic) || !actualMagic.contentEquals(magic)) {
            throw IllegalArgumentException("Invalid PackProof encrypted file header.")
          }
          val version = fileInput.read()
          val ivLength = fileInput.read()
          if (version !in 1..formatVersion || ivLength !in 12..32) {
            throw IllegalArgumentException("Unsupported PackProof encrypted file version.")
          }
          val iv = ByteArray(ivLength)
          if (!readFully(fileInput, iv)) throw IllegalArgumentException("Truncated PackProof encrypted file.")

          val cipher = Cipher.getInstance("AES/GCM/NoPadding")
          cipher.init(Cipher.DECRYPT_MODE, getOrCreateEncryptionKey(), GCMParameterSpec(128, iv))
          if (version >= 2) {
            cipher.updateAAD(magic + byteArrayOf(version.toByte(), ivLength.toByte()))
          }
          BufferedInputStream(fileInput, bufferSize).use { input ->
            FileOutputStream(temporary).use { fileOutput ->
              BufferedOutputStream(fileOutput, bufferSize).use { output ->
                val buffer = ByteArray(bufferSize)
                while (true) {
                  val read = input.read(buffer)
                  if (read < 0) break
                  if (read == 0) continue
                  cipher.update(buffer, 0, read)?.let(output::write)
                }
                // AES-GCM authenticates the tag here. Until this succeeds all
                // plaintext remains in an unreferenced private temporary file.
                cipher.doFinal()?.let(output::write)
                output.flush()
                fileOutput.fd.sync()
              }
            }
          }
        }
        replaceWithCommittedFile(temporary, destination)
        mapOf("decryptedPath" to Uri.fromFile(destination).toString())
      } catch (error: Throwable) {
        temporary.delete()
        throw error
      }
    }

    AsyncFunction("sha256File") { sourceUri: String ->
      val source = resolveFile(sourceUri).canonicalFile
      require(source.isFile) { "The PackProof hash source is not a readable file." }
      val digest = MessageDigest.getInstance("SHA-256")
      BufferedInputStream(FileInputStream(source), bufferSize).use { input ->
        val buffer = ByteArray(bufferSize)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          if (read > 0) digest.update(buffer, 0, read)
        }
      }
      digest.digest().toHex()
    }

    AsyncFunction("analyzeImageQuality") { sourceUri: String ->
      val source = resolveFile(sourceUri).canonicalFile
      require(source.isFile) { "The PackProof image-quality source is not a readable file." }

      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(source.path, bounds)
      require(bounds.outWidth > 0 && bounds.outHeight > 0) { "The image could not be decoded for quality analysis." }

      var sampleSize = 1
      while (bounds.outWidth / sampleSize > 512 || bounds.outHeight / sampleSize > 512) sampleSize *= 2
      val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
      val bitmap = BitmapFactory.decodeFile(source.path, options)
        ?: throw IllegalArgumentException("The image could not be decoded for quality analysis.")

      try {
        val width = bitmap.width
        val height = bitmap.height
        require(width > 2 && height > 2) { "The image sample is too small for quality analysis." }
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        val luminance = DoubleArray(pixels.size)
        val histogram = IntArray(256)
        var sum = 0.0
        var sumSquares = 0.0
        var darkClipped = 0
        var brightClipped = 0

        for (index in pixels.indices) {
          val pixel = pixels[index]
          val y = 0.2126 * Color.red(pixel) + 0.7152 * Color.green(pixel) + 0.0722 * Color.blue(pixel)
          luminance[index] = y
          sum += y
          sumSquares += y * y
          val bucket = y.toInt().coerceIn(0, 255)
          histogram[bucket] += 1
          if (bucket <= 5) darkClipped += 1
          if (bucket >= 250) brightClipped += 1
        }

        val count = luminance.size.toDouble()
        val mean = sum / count
        val variance = (sumSquares / count - mean * mean).coerceAtLeast(0.0)
        var laplacianSum = 0.0
        var laplacianSquares = 0.0
        var laplacianCount = 0
        for (row in 1 until height - 1) {
          for (column in 1 until width - 1) {
            val center = row * width + column
            val laplacian = 4.0 * luminance[center] - luminance[center - 1] - luminance[center + 1] - luminance[center - width] - luminance[center + width]
            laplacianSum += laplacian
            laplacianSquares += laplacian * laplacian
            laplacianCount += 1
          }
        }
        val laplacianMean = laplacianSum / laplacianCount.toDouble()
        val laplacianVariance = (laplacianSquares / laplacianCount.toDouble() - laplacianMean * laplacianMean).coerceAtLeast(0.0)

        fun percentile(q: Double): Int {
          val target = (pixels.size * q).toInt().coerceIn(0, pixels.size - 1)
          var cumulative = 0
          for (index in histogram.indices) {
            cumulative += histogram[index]
            if (cumulative > target) return index
          }
          return 255
        }

        mapOf(
          "algorithm" to "PP_IMAGE_QUALITY_SIGNAL_V1",
          "sourceWidthPx" to bounds.outWidth,
          "sourceHeightPx" to bounds.outHeight,
          "sampleWidthPx" to width,
          "sampleHeightPx" to height,
          "meanLuminance" to mean,
          "luminanceStdDev" to kotlin.math.sqrt(variance),
          "p05Luminance" to percentile(0.05),
          "p95Luminance" to percentile(0.95),
          "shadowClippingFraction" to darkClipped / count,
          "highlightClippingFraction" to brightClipped / count,
          "laplacianVariance" to laplacianVariance,
          "interpretation" to "MEASUREMENT_SIGNAL_ONLY_THRESHOLDS_NOT_VALIDATED"
        )
      } finally {
        bitmap.recycle()
      }
    }

    AsyncFunction("deleteFile") { sourceUri: String ->
      val file = resolveFile(sourceUri).canonicalFile
      requirePrivateFile(file)
      !file.exists() || (file.isFile && file.delete())
    }

    AsyncFunction("signChallenge") { challenge: String ->
      require(challenge.length in 8..512) { "Challenge length is invalid." }
      val keyPair = getOrCreateSigningKey()
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(keyPair.private)
      signer.update(challenge.toByteArray(Charsets.UTF_8))
      val signature = signer.sign()
      val keyInfo = KeyFactory.getInstance(keyPair.private.algorithm, "AndroidKeyStore")
        .getKeySpec(keyPair.private, KeyInfo::class.java)
      mapOf(
        "algorithm" to "SHA256withECDSA",
        "keyAlias" to signingKeyAlias,
        "publicKeySpkiBase64" to Base64.encodeToString(keyPair.public.encoded, Base64.NO_WRAP),
        "challengeSignatureBase64" to Base64.encodeToString(signature, Base64.NO_WRAP),
        "hardwareBacked" to isHardwareBacked(keyInfo)
      )
    }
  }

  private fun getOrCreateSigningKey(): KeyPair {
    val keyStore = androidKeyStore()
    val existingPrivate = keyStore.getKey(signingKeyAlias, null) as? java.security.PrivateKey
    val existingPublic = keyStore.getCertificate(signingKeyAlias)?.publicKey
    if (existingPrivate != null && existingPublic != null) return KeyPair(existingPublic, existingPrivate)

    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
    generator.initialize(
      KeyGenParameterSpec.Builder(
        signingKeyAlias,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
      )
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setUserAuthenticationRequired(false)
        .build()
    )
    return generator.generateKeyPair()
  }

  private fun getOrCreateEncryptionKey(): SecretKey {
    val keyStore = androidKeyStore()
    (keyStore.getKey(encryptionKeyAlias, null) as? SecretKey)?.let { return it }

    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        encryptionKeyAlias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setKeySize(256)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build()
    )
    return generator.generateKey()
  }

  private fun androidKeyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  @Suppress("DEPRECATION")
  private fun isHardwareBacked(keyInfo: KeyInfo): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    keyInfo.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
      keyInfo.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX
  } else {
    keyInfo.isInsideSecureHardware
  }

  private fun ByteArray.toHex(): String = joinToString(separator = "") { byte -> "%02x".format(byte) }

  private fun readFully(input: InputStream, target: ByteArray): Boolean {
    var offset = 0
    while (offset < target.size) {
      val read = input.read(target, offset, target.size - offset)
      if (read < 0) return false
      offset += read
    }
    return true
  }

  private fun resolveFile(value: String): File {
    val uri = Uri.parse(value)
    return if (uri.scheme == null || uri.scheme == "file") {
      File(uri.path ?: value)
    } else {
      throw IllegalArgumentException("Only private file URIs are supported.")
    }
  }

  private fun requirePrivateFile(file: File) {
    val context = appContext.reactContext ?: throw IllegalStateException("React context unavailable.")
    val allowedRoots = listOf(context.filesDir, context.cacheDir, context.noBackupFilesDir)
      .map(File::getCanonicalFile)
    val target = file.canonicalFile
    if (allowedRoots.none { target.path == it.path || target.path.startsWith(it.path + File.separator) }) {
      throw SecurityException("PackProof secure files must stay inside private application storage.")
    }
  }

  private fun ensureParent(file: File) {
    val parent = file.parentFile ?: throw IllegalArgumentException("A destination directory is required.")
    if (!parent.exists() && !parent.mkdirs()) throw IllegalStateException("Could not create the secure-file directory.")
    if (!parent.isDirectory) throw IllegalArgumentException("The secure-file parent is not a directory.")
  }

  private fun temporarySibling(destination: File): File {
    val parent = destination.parentFile ?: throw IllegalArgumentException("A destination directory is required.")
    val temporary = File(parent, ".${destination.name}.${UUID.randomUUID()}.tmp")
    if (temporary.exists() && !temporary.delete()) throw IllegalStateException("Could not clear a stale temporary file.")
    return temporary
  }

  private fun replaceWithCommittedFile(temporary: File, destination: File) {
    try {
      Files.move(
        temporary.toPath(),
        destination.toPath(),
        StandardCopyOption.ATOMIC_MOVE,
        StandardCopyOption.REPLACE_EXISTING
      )
    } catch (_: AtomicMoveNotSupportedException) {
      Files.move(temporary.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
    }
  }
}
