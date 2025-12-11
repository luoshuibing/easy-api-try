# Easy API Try

一个面向Trae/VS Code的轻量扩展，用于在编辑器内扫描Spring Boot项目中的接口并进行简单的API调试（Spring Boot优先）。

## 特性
- 扫描`@RestController/@Controller`下的`@GetMapping/@PostMapping/@PutMapping/@DeleteMapping/@PatchMapping/@RequestMapping`
- 支持类级`@RequestMapping`前缀与无路径`@PostMapping()`等写法
- 自动提取路径变量并生成输入框，点击接口后高亮选中
- 扩展侧发送HTTP/HTTPS请求，避免Webview的CORS限制
- 端口只需填写，如`8080`，默认主机`localhost`，协议可选`http/https`
- 请求头以表格形式维护，支持增删与常见默认值
- 一键格式化请求体JSON，响应以文本展示
- 刷新按钮重新扫描接口，扩展输出面板包含调试日志

## 安装
- 本地调试：在Trae/VS Code中打开本项目，运行`编译`或直接F5启动扩展调试
- VSIX安装：在扩展视图中选择`Install from VSIX...`，并选择已生成的VSIX文件（名称随版本与包名变化）

## 使用
1. 打开命令面板，运行`扫描Spring Boot接口并打开调试器`
2. 在左侧接口列表中选择一个接口，右侧会展示其方法与路径，同时生成路径变量输入框
3. 可设置`主机/协议/端口`，若仅填写端口，主机默认为`localhost`
4. 在请求头表格中新增或修改键值；请求体支持原始字符串或JSON
5. 点击`发送请求`，在下方查看响应状态、头与文本内容
6. 若接口列表为空或需要重新识别，点击`刷新接口`

## 注意事项
- 扫描基于正则解析，复杂条件或自定义注解可能无法识别
- 仅识别Java文件中的标准注解；Kotlin或其他语言当前不支持
- HTTP请求在扩展进程中完成；Webview不会直接跨域访问后端
- 端口默认`8080`；如后端运行在其他端口，请自行修改

## 常见问题
- 看不到接口：确保工作区包含`.java`文件且使用了Spring MVC注解；点击`刷新接口`
- 请求失败：检查`主机/协议/端口`是否正确；确认服务已启动并可达
- 查看日志：执行`Developer: Toggle Developer Tools`并切到本Webview；或打开`Easy API Try`输出面板

## 版本
详见`CHANGELOG.md`
