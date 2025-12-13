// index.ts
// 変数に「型」を指定する（: string の部分）
var message = "こんにちは、TypeScript！";
// 関数にも型を指定できる
// nameはstring(文字)、戻り値はvoid(なし)
function greet(name) {
    console.log("Hello, " + name);
}
greet("世界");
