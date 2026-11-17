package com.lab3app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * MagnetometerModule - Turbo Native Module để đọc dữ liệu Magnetometer (Từ kế)
 * và tính góc phương hướng so với hướng Bắc địa lý.
 *
 * Cách hoạt động:
 * 1. Kết hợp dữ liệu từ Accelerometer (gia tốc kế) và Magnetometer
 *    để tính toán ma trận xoay chính xác hơn.
 * 2. Dùng SensorManager.getRotationMatrix() và SensorManager.getOrientation()
 *    để lấy azimuth (góc so với Bắc từ trường).
 * 3. Áp dụng bộ lọc Low-Pass để làm mượt dữ liệu, tránh rung lắc.
 * 4. Phát sự kiện "MagnetometerUpdate" lên JS với giá trị góc (degrees).
 */
class MagnetometerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    private var sensorManager: SensorManager? = null
    private var magnetometer: Sensor? = null
    private var accelerometer: Sensor? = null
    private var isListening = false

    // Lưu trữ dữ liệu cảm biến thô
    private val accelerometerReading = FloatArray(3)
    private val magnetometerReading = FloatArray(3)

    // Ma trận tính toán
    private val rotationMatrix = FloatArray(9)
    private val orientationAngles = FloatArray(3)

    // Bộ lọc Low-Pass để làm mượt dữ liệu
    private val ALPHA = 0.1f  // Hệ số làm mượt (0 = không lọc, 1 = lọc mạnh nhất)
    private var hasAccelData = false
    private var hasMagnetData = false

    // Throttle: chỉ gửi event tối đa mỗi 50ms
    private var lastEventTime = 0L
    private val EVENT_THROTTLE_MS = 50L

    companion object {
        const val MAGNETOMETER_UPDATE_EVENT = "MagnetometerUpdate"
    }

    override fun getName(): String = "MagnetometerModule"

    /**
     * Kiểm tra thiết bị có hỗ trợ từ kế không
     */
    @ReactMethod
    fun isMagnetometerAvailable(promise: Promise) {
        val sm = reactContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val hasMag = sm?.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null
        val hasAcc = sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null
        promise.resolve(hasMag && hasAcc)
    }

    /**
     * Bắt đầu lắng nghe dữ liệu Magnetometer + Accelerometer.
     * Cả hai cảm biến cần thiết để tính toán chính xác góc phương hướng.
     */
    @ReactMethod
    fun startMagnetometerUpdates(promise: Promise) {
        if (isListening) {
            promise.resolve(true)
            return
        }

        sensorManager = reactContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        if (sensorManager == null) {
            promise.reject("E_NO_SENSOR_MANAGER", "SensorManager không khả dụng")
            return
        }

        magnetometer = sensorManager!!.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        accelerometer = sensorManager!!.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        if (magnetometer == null) {
            promise.reject("E_NO_MAGNETOMETER", "Thiết bị không có cảm biến từ kế")
            return
        }

        if (accelerometer == null) {
            promise.reject("E_NO_ACCELEROMETER", "Thiết bị không có gia tốc kế")
            return
        }

        // Đăng ký listener với tốc độ GAME (50Hz) để cập nhật mượt
        val magOk = sensorManager!!.registerListener(
            this, magnetometer, SensorManager.SENSOR_DELAY_GAME
        )
        val accOk = sensorManager!!.registerListener(
            this, accelerometer, SensorManager.SENSOR_DELAY_GAME
        )

        if (magOk && accOk) {
            isListening = true
            promise.resolve(true)
        } else {
            promise.reject("E_REGISTER_FAILED", "Không thể đăng ký cảm biến")
        }
    }

    /**
     * Dừng lắng nghe dữ liệu Magnetometer.
     */
    @ReactMethod
    fun stopMagnetometerUpdates(promise: Promise) {
        if (!isListening) {
            promise.resolve(true)
            return
        }
        sensorManager?.unregisterListener(this)
        isListening = false
        hasAccelData = false
        hasMagnetData = false
        promise.resolve(true)
    }

    /**
     * Callback khi có dữ liệu cảm biến mới.
     * Xử lý cả Accelerometer và Magnetometer.
     */
    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                // Low-pass filter để lọc rung lắc
                accelerometerReading[0] = lowPassFilter(event.values[0], accelerometerReading[0])
                accelerometerReading[1] = lowPassFilter(event.values[1], accelerometerReading[1])
                accelerometerReading[2] = lowPassFilter(event.values[2], accelerometerReading[2])
                hasAccelData = true
            }
            Sensor.TYPE_MAGNETIC_FIELD -> {
                magnetometerReading[0] = lowPassFilter(event.values[0], magnetometerReading[0])
                magnetometerReading[1] = lowPassFilter(event.values[1], magnetometerReading[1])
                magnetometerReading[2] = lowPassFilter(event.values[2], magnetometerReading[2])
                hasMagnetData = true
            }
        }

        // Chỉ tính toán khi có đủ cả 2 loại dữ liệu
        if (!hasAccelData || !hasMagnetData) return

        // Throttle để không gửi quá nhiều event
        val now = System.currentTimeMillis()
        if (now - lastEventTime < EVENT_THROTTLE_MS) return
        lastEventTime = now

        // Tính ma trận xoay từ accelerometer + magnetometer
        val success = SensorManager.getRotationMatrix(
            rotationMatrix, null, accelerometerReading, magnetometerReading
        )

        if (!success) return

        // Lấy góc hướng: orientationAngles[0] = azimuth (Bắc)
        SensorManager.getOrientation(rotationMatrix, orientationAngles)

        // Chuyển từ radians sang degrees, chuẩn hóa về [0, 360)
        val azimuthRad = orientationAngles[0]
        var azimuthDeg = Math.toDegrees(azimuthRad.toDouble()).toFloat()
        if (azimuthDeg < 0) azimuthDeg += 360f

        // Phát sự kiện lên JS
        val params: WritableMap = Arguments.createMap().apply {
            putDouble("azimuth", azimuthDeg.toDouble())          // Góc Bắc (0-360°)
            putDouble("pitch", Math.toDegrees(orientationAngles[1].toDouble()))
            putDouble("roll", Math.toDegrees(orientationAngles[2].toDouble()))
            putDouble("x", magnetometerReading[0].toDouble())     // Raw magnetic X (µT)
            putDouble("y", magnetometerReading[1].toDouble())     // Raw magnetic Y (µT)
            putDouble("z", magnetometerReading[2].toDouble())     // Raw magnetic Z (µT)
        }

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(MAGNETOMETER_UPDATE_EVENT, params)
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        // Không cần xử lý
    }

    /**
     * Bộ lọc Low-Pass: làm mượt tín hiệu cảm biến
     * output = alpha * input + (1 - alpha) * previousOutput
     */
    private fun lowPassFilter(input: Float, output: Float): Float {
        return ALPHA * input + (1.0f - ALPHA) * output
    }

    // Bắt buộc cho React Native Event Emitter
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
