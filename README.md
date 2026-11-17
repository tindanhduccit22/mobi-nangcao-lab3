# Lab 3: Using Sensors in React Native with Turbo Modules

**Trường Đại học Quốc tế Miền Đông (EIU)**  
**Khoa Công nghệ Thông tin (School of Computing and Information Technology)**  
**Môn học:** Lập trình di động nâng cao (Advanced Mobile Programming - CSW 434)  
**Sinh viên thực hiện:** Danh Đức Tín  
**MSSV:** 2231200120  

---

## 🎯 Mục tiêu thực hành (Objectives)
- Hiểu và áp dụng kiến trúc **Turbo Native Modules** trong React Native (New Architecture).
- Truy cập trực tiếp phần cứng Android mà **không sử dụng thư viện bên thứ ba** (không dùng `react-native-nfc-manager`, không dùng `expo-sensors`).
- Lập trình **NFC (Near Field Communication)**: phát hiện thẻ, đọc Tag ID, NDEF records, technologies.
- Lập trình **La bàn (Compass - Magnetometer & Accelerometer)**: tính toán góc phương hướng (Azimuth), lọc rung lắc Low-Pass, hiển thị giao diện la bàn xoay trực quan hướng Bắc.

---

## 📱 Cấu trúc và Kiến trúc Dự án

### 1. Exercise 1: NFC Reader (`NFCModule.kt`)
- **Tệp nguồn:** `android/app/src/main/java/com/lab3app/NFCModule.kt`
- **Cách thức hoạt động:**
  - Kiểm tra hỗ trợ và trạng thái bật/tắt NFC qua `NfcAdapter`.
  - Sử dụng **NFC Foreground Dispatch System** (`enableForegroundDispatch`) để ứng dụng ưu tiên nhận NFC intent khi đang mở trên màn hình.
  - Khi thẻ NFC được chạm vào thiết bị, `MainActivity.onNewIntent(intent)` chuyển tiếp dữ liệu đến `NFCModule.handleNFCIntent(intent)`.
  - Giải mã Tag ID dạng Hex, danh sách công nghệ NFC (`NfcA`, `IsoDep`, `MifareClassic`, `Ndef`...), và bóc tách các bản ghi NDEF (Text, URI, MIME).
  - Phát sự kiện `NFCTagDetected` thời gian thực lên React Native qua `RCTDeviceEventEmitter`.

### 2. Exercise 2: Dynamic Compass (`MagnetometerModule.kt`)
- **Tệp nguồn:** `android/app/src/main/java/com/lab3app/MagnetometerModule.kt`
- **Cách thức hoạt động:**
  - Đăng ký lắng nghe hai cảm biến phần cứng đồng thời: `Sensor.TYPE_MAGNETIC_FIELD` (Từ kế) và `Sensor.TYPE_ACCELEROMETER` (Gia tốc kế) qua `SensorManager`.
  - Áp dụng **Bộ lọc Low-Pass Filter** để triệt tiêu rung lắc của cảm biến.
  - Sử dụng thuật toán chuẩn Android:
    1. `SensorManager.getRotationMatrix()` kết hợp gia tốc và từ trường để xác định ma trận xoay trong không gian 3 chiều (bù góc nghiêng - tilt compensated).
    2. `SensorManager.getOrientation()` lấy góc Azimuth (hướng Bắc), Pitch và Roll.
    3. Chuẩn hóa góc sang đơn vị Độ $[0^\circ, 360^\circ)$.
  - Phát sự kiện `MagnetometerUpdate` liên tục (được điều phối throttle 50ms) lên React Native.

### 3. Giao diện người dùng (`App.tsx`)
- Tích hợp thanh chuyển đổi Tab mượt mà giữa **NFC Reader** và **Compass**.
- **Màn hình La bàn:** Thiết kế trực quan theo đúng mẫu đề bài (dial xoay mượt mà với hiệu ứng lò xo `Animated.spring`, hiển thị góc độ số to bản, chữ hướng N/E/S/W, và dấu chấm chỉ hướng).
- **Màn hình NFC:** Trạng thái hỗ trợ phần cứng, hiệu ứng radar xung nhịp khi đang quét, thẻ thông tin chi tiết đầy đủ khi quét thành công thẻ NFC.

---

## 🚀 Hướng dẫn cài đặt và khởi chạy

### Bước 1: Cài đặt dependencies
```bash
npm install
```

### Bước 2: Chạy Metro Dev Server
```bash
npm start
```

### Bước 3: Build và chạy ứng dụng lên thiết bị / máy ảo Android
```bash
npm run android
```
*(Hoặc mở thư mục `android` trong Android Studio và nhấn Run)*

---

## 📦 File APK Debug đã được build sẵn
File APK hoàn thiện sẵn sàng cài đặt tại:
`android/app/build/outputs/apk/debug/app-debug.apk`
