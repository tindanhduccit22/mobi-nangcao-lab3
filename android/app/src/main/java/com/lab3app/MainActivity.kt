package com.lab3app

import android.content.Intent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "Lab3App"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Khi ứng dụng đang chạy foreground và có NFC tag mới được đưa đến,
   * hệ thống gọi onNewIntent() với NFC Intent.
   * Chuyển intent này cho NFCModule để xử lý và phát sự kiện lên React Native.
   */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)

    // Tìm NFCModule trong ReactHost và xử lý intent
    val reactHost = (application as MainApplication).reactHost
    val catalystInstance = reactHost.currentReactContext
    if (catalystInstance != null) {
      val nfcModule = catalystInstance.getNativeModule(NFCModule::class.java)
      nfcModule?.handleNFCIntent(intent)
    }
  }
}
