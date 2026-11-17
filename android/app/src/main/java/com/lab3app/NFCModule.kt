package com.lab3app

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NdefMessage
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NfcA
import android.nfc.tech.NfcB
import android.nfc.tech.NfcF
import android.nfc.tech.NfcV
import android.nfc.tech.IsoDep
import android.nfc.tech.MifareClassic
import android.nfc.tech.MifareUltralight
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.nio.charset.Charset

/**
 * NFCModule - Turbo Native Module để đọc dữ liệu từ thẻ NFC trên Android.
 *
 * Cách hoạt động:
 * 1. Khi JS gọi startNFCScan(), module kích hoạt NFC Foreground Dispatch
 *    để ứng dụng có độ ưu tiên cao nhất nhận NFC intent.
 * 2. Khi thẻ NFC được đưa đến, Android gửi intent đến onNewIntent() của Activity.
 * 3. Module xử lý intent, trích xuất thông tin thẻ và phát sự kiện "NFCTagDetected"
 *    lên JS thông qua DeviceEventEmitter.
 * 4. JS gọi stopNFCScan() để hủy foreground dispatch khi không cần nữa.
 */
class NFCModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var nfcAdapter: NfcAdapter? = null
    private var pendingIntent: PendingIntent? = null
    private var intentFiltersArray: Array<IntentFilter>? = null
    private var techListsArray: Array<Array<String>>? = null
    private var isScanning = false

    // Tên sự kiện gửi lên JS
    companion object {
        const val NFC_TAG_DETECTED_EVENT = "NFCTagDetected"
        const val NFC_ERROR_EVENT = "NFCError"
        const val NFC_STATUS_EVENT = "NFCStatus"
    }

    override fun getName(): String = "NFCModule"

    /**
     * Kiểm tra thiết bị có hỗ trợ NFC không
     */
    @ReactMethod
    fun isNFCSupported(promise: Promise) {
        val adapter = NfcAdapter.getDefaultAdapter(reactContext)
        promise.resolve(adapter != null)
    }

    /**
     * Kiểm tra NFC có đang bật không
     */
    @ReactMethod
    fun isNFCEnabled(promise: Promise) {
        val adapter = NfcAdapter.getDefaultAdapter(reactContext)
        if (adapter == null) {
            promise.resolve(false)
        } else {
            promise.resolve(adapter.isEnabled)
        }
    }

    /**
     * Bắt đầu lắng nghe thẻ NFC bằng Foreground Dispatch System.
     * Phải được gọi từ onResume() của Activity.
     */
    @ReactMethod
    fun startNFCScan(promise: Promise) {
        val activity: Activity? = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Activity hiện tại không tồn tại")
            return
        }

        nfcAdapter = NfcAdapter.getDefaultAdapter(reactContext)
        if (nfcAdapter == null) {
            promise.reject("E_NFC_NOT_SUPPORTED", "Thiết bị không hỗ trợ NFC")
            return
        }

        if (!nfcAdapter!!.isEnabled) {
            promise.reject("E_NFC_DISABLED", "NFC chưa được bật trên thiết bị")
            return
        }

        // Tạo PendingIntent để hệ thống giao intent NFC cho Activity hiện tại
        val nfcIntent = Intent(activity, activity.javaClass).apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        else
            PendingIntent.FLAG_UPDATE_CURRENT

        pendingIntent = PendingIntent.getActivity(activity, 0, nfcIntent, flags)

        // IntentFilters: lắng nghe mọi loại NFC tag
        val ndefFilter = IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply {
            try { addDataType("*/*") } catch (_: IntentFilter.MalformedMimeTypeException) {}
        }
        val tagFilter = IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED)
        val techFilter = IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED)
        intentFiltersArray = arrayOf(ndefFilter, tagFilter, techFilter)

        // Danh sách các công nghệ NFC được hỗ trợ
        techListsArray = arrayOf(
            arrayOf(Ndef::class.java.name),
            arrayOf(NfcA::class.java.name),
            arrayOf(NfcB::class.java.name),
            arrayOf(NfcF::class.java.name),
            arrayOf(NfcV::class.java.name),
            arrayOf(IsoDep::class.java.name),
            arrayOf(MifareClassic::class.java.name),
            arrayOf(MifareUltralight::class.java.name)
        )

        // Kích hoạt foreground dispatch trên UI thread
        activity.runOnUiThread {
            try {
                nfcAdapter!!.enableForegroundDispatch(
                    activity, pendingIntent, intentFiltersArray, techListsArray
                )
                isScanning = true
                sendEvent(NFC_STATUS_EVENT, createStatusMap("scanning", "Đang chờ thẻ NFC..."))
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("E_NFC_SCAN_ERROR", e.message, e)
            }
        }
    }

    /**
     * Dừng lắng nghe NFC, hủy foreground dispatch.
     */
    @ReactMethod
    fun stopNFCScan(promise: Promise) {
        val activity: Activity? = reactContext.currentActivity
        if (activity == null || nfcAdapter == null) {
            isScanning = false
            promise.resolve(true)
            return
        }

        activity.runOnUiThread {
            try {
                nfcAdapter!!.disableForegroundDispatch(activity)
                isScanning = false
                sendEvent(NFC_STATUS_EVENT, createStatusMap("idle", "NFC đã dừng"))
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("E_NFC_STOP_ERROR", e.message, e)
            }
        }
    }

    /**
     * Xử lý NFC Intent khi thẻ được phát hiện.
     * Được gọi từ MainActivity.onNewIntent() hoặc qua Activity lifecycle.
     * Phát sự kiện "NFCTagDetected" lên React Native.
     */
    fun handleNFCIntent(intent: Intent) {
        val action = intent.action ?: return

        if (action != NfcAdapter.ACTION_NDEF_DISCOVERED &&
            action != NfcAdapter.ACTION_TAG_DISCOVERED &&
            action != NfcAdapter.ACTION_TECH_DISCOVERED) {
            return
        }

        val tag: Tag? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG, Tag::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
        }

        if (tag == null) {
            sendEvent(NFC_ERROR_EVENT, createErrorMap("E_NULL_TAG", "Không nhận được dữ liệu thẻ"))
            return
        }

        val tagInfo = Arguments.createMap()

        // 1. ID thẻ (hex)
        val tagId = tag.id
        val tagIdHex = tagId.joinToString(separator = "") { "%02X".format(it) }
        tagInfo.putString("id", tagIdHex)

        // 2. Các công nghệ NFC thẻ hỗ trợ
        val techList = Arguments.createArray()
        tag.techList.forEach { techList.pushString(it.substringAfterLast('.')) }
        tagInfo.putArray("technologies", techList)

        // 3. Thử đọc NDEF message nếu có
        val ndefMessages: Array<NdefMessage>? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES, NdefMessage::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)
                ?.filterIsInstance<NdefMessage>()?.toTypedArray()
        }

        val recordsArray = Arguments.createArray()
        var hasNdefData = false

        if (!ndefMessages.isNullOrEmpty()) {
            hasNdefData = true
            for (message in ndefMessages) {
                for (record in message.records) {
                    val recordMap = Arguments.createMap()
                    // TNF (Type Name Format)
                    recordMap.putInt("tnf", record.tnf.toInt())

                    // Type
                    val typeStr = try {
                        String(record.type, Charset.forName("UTF-8"))
                    } catch (_: Exception) { "" }
                    recordMap.putString("type", typeStr)

                    // Payload: thử decode UTF-8 hoặc UTF-16
                    val payload = record.payload
                    val text = try {
                        if (payload.isNotEmpty() && (payload[0].toInt() and 0x80) == 0) {
                            // Bit 7 = 0 → UTF-8
                            val langCodeLen = payload[0].toInt() and 0x3F
                            String(payload, 1 + langCodeLen, payload.size - 1 - langCodeLen, Charsets.UTF_8)
                        } else if (payload.isNotEmpty()) {
                            // UTF-16
                            val langCodeLen = payload[0].toInt() and 0x3F
                            String(payload, 1 + langCodeLen, payload.size - 1 - langCodeLen, Charsets.UTF_16)
                        } else {
                            ""
                        }
                    } catch (_: Exception) {
                        // Raw hex fallback
                        payload.joinToString(" ") { "%02X".format(it) }
                    }
                    recordMap.putString("text", text)
                    recordMap.putString("rawPayloadHex", payload.joinToString("") { "%02X".format(it) })
                    recordsArray.pushMap(recordMap)
                }
            }
        } else {
            // Thử đọc NDEF trực tiếp từ tag nếu action không có NDEF extras
            try {
                val ndef = Ndef.get(tag)
                if (ndef != null) {
                    ndef.connect()
                    val ndefMsg = ndef.ndefMessage
                    ndef.close()
                    if (ndefMsg != null) {
                        hasNdefData = true
                        for (record in ndefMsg.records) {
                            val recordMap = Arguments.createMap()
                            recordMap.putInt("tnf", record.tnf.toInt())
                            val payload = record.payload
                            val text = try {
                                val langCodeLen = payload[0].toInt() and 0x3F
                                String(payload, 1 + langCodeLen, payload.size - 1 - langCodeLen, Charsets.UTF_8)
                            } catch (_: Exception) {
                                payload.joinToString(" ") { "%02X".format(it) }
                            }
                            recordMap.putString("text", text)
                            recordMap.putString("rawPayloadHex", payload.joinToString("") { "%02X".format(it) })
                            recordsArray.pushMap(recordMap)
                        }
                    }
                }
            } catch (_: Exception) {}
        }

        tagInfo.putArray("records", recordsArray)
        tagInfo.putBoolean("hasNdefData", hasNdefData)
        tagInfo.putString("action", action.substringAfterLast('.'))

        sendEvent(NFC_TAG_DETECTED_EVENT, tagInfo)
    }

    // Gửi sự kiện lên React Native JS
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun createStatusMap(status: String, message: String): WritableMap {
        return Arguments.createMap().apply {
            putString("status", status)
            putString("message", message)
        }
    }

    private fun createErrorMap(code: String, message: String): WritableMap {
        return Arguments.createMap().apply {
            putString("code", code)
            putString("message", message)
        }
    }

    // Cho phép JS đăng ký listener (bắt buộc với Turbo Module event emitter)
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
