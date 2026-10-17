# 头像交互修正

取消预设文字头像选择器。头像与昵称分开显示，未上传时使用昵称首字；旧的“叶”等值只为历史资料兼容读取，界面不会再显示为昵称前缀。

支持 JPG、PNG、WebP 文件，最大 5MB，本地解码后居中裁剪为 256×256 JPEG，预览后点保存才生效。支持恢复昵称首字；昵称改动会同步首字预览。图片处理失败不修改原头像；处理期间禁止保存，关闭或重置后不会应用旧异步结果。

演示数据仍只保存在当前浏览器，不是服务端文件上传。后端资料接口兼容 JPEG data URL，JSON 上限调整为 200KB；后续真实上传服务需要服务器解码、重编码和文件存储，不将前端检查视为可信凭据。

浏览器验证：昵称“肉桂妹妹”显示默认头像“肉”；临时测试图片上传、预览、保存及刷新恢复均通过；测试后恢复昵称首字，保留原昵称。新增测试覆盖首字、默认头像、非法图片类型及文件大小。

合并更新的 auth/profile.mjs、auth/profile-dialog.mjs、auth/avatar-upload.mjs（新增）、auth/login-dialog.css、auth/session.d.mts、components/AuthStatus.vue，以及 server/auth.mjs、server/auth-store.mjs。两个 Vue 交付包同名账号文件一致。demo.html 已同步。
