package nl.vandijk.immichsort

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.io.File

class PhotoSharingPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PhotoSharingModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class PhotoSharingModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var pending: Promise? = null
  private val requestCode = 8541
  init {
    context.addActivityEventListener(object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, request: Int, result: Int, data: Intent?) {
        if (request == requestCode) { pending?.resolve(null); pending = null }
      }
    })
  }
  override fun getName() = "PhotoSharing"

  @ReactMethod
  fun share(files: ReadableArray, promise: Promise) {
    context.runOnUiQueueThread {
      if (pending != null) { promise.reject("BUSY", "Sharing is already open."); return@runOnUiQueueThread }
      try {
        val activity = context.currentActivity ?: throw IllegalStateException("No active screen.")
        require(files.size() > 0) { "Select at least one photo." }
        val uris = arrayListOf<Uri>()
        val types = mutableListOf<String>()
        for (index in 0 until files.size()) {
          val item = files.getMap(index) ?: throw IllegalArgumentException("Invalid photo.")
          val uri = Uri.parse(item.getString("uri"))
          require(uri.scheme == "file") { "Only downloaded files can be shared." }
          val file = File(requireNotNull(uri.path)).canonicalFile
          val cache = context.cacheDir.canonicalFile
          require(file.path.startsWith(cache.path + File.separator) && file.isFile) { "Photo is outside the app cache." }
          uris.add(FileProvider.getUriForFile(context, context.packageName + ".SharingFileProvider", file))
          types.add(item.getString("mimeType") ?: "application/octet-stream")
        }
        val mime = if (types.distinct().size == 1) types.first() else if (types.all { it.startsWith("image/") }) "image/*" else "*/*"
        val clip = ClipData.newUri(context.contentResolver, "Photos", uris.first())
        uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
        val send = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
          type = mime
          if (uris.size == 1) putExtra(Intent.EXTRA_STREAM, uris.first())
          else putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
          clipData = clip
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, "Share photos").apply { addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        pending = promise
        activity.startActivityForResult(chooser, requestCode)
      } catch (e: Exception) { pending = null; promise.reject("SHARE_FAILED", e.message, e) }
    }
  }
}
