# 分发组件与许可

本发布物包含 B-A-T 自有适配源码和由唯一公共源码生成的 bat-request-budget wheel。
各第三方组件仍分别适用其原许可证。安装时获取的原归档保留 LICENSE/NOTICE、固定来源和 SHA256；修改过的组件同时保留本包 recipe/补丁，不能把整个组合统一声称为一种许可证。

- CrowdSec 1.8.1、BotD 2.0.0、CreepJS 固定源码、PyrateLimiter 4.5.0：保留对应上游 MIT 许可证。
- filelock 3.19.1：Unlicense。
- 本机 HTTPS 信任工具 mkcert 1.4.4：BSD-3-Clause；运行时从官方固定 release 下载，校验 Microsoft winget 固定版本所列 SHA256，不随本包分发私钥或运行证书。源码 https://github.com/FiloSottile/mkcert/tree/v1.4.4 。
- Traefik 3.7.14 / bouncer 710e88808baccb320d7b2b3560397e1474e3e98b：MIT / Apache-2.0。
- HAProxy Ubuntu 固定源码及元数据补丁：保留 GPL-2.0 和源文件说明；本包带公开 recipe，固定源码 URL/SHA 在 artifacts.json。
- JA4 Lua 6abe401466537f896482900969b06c1e302498a0：MPL-2.0。
- DB-IP Country/ASN Lite 数据：CC-BY-4.0，署名 IP Geolocation by DB-IP，https://db-ip.com 。数据不随源码发布包分发。
- FCaptcha / Kitsune 仅使用已选固定窄函数，保留下载文件中的上游声明；其来源与摘要见 artifacts.json。

本版针对既有 Windows + WSL Ubuntu 的本地单实例运行。各组件完整许可文本应随原归档保留；上游版本升级必须重新核对，不以此摘要覆盖原许可。

## Deployment host tools (2026-10-12)

- Lima 2.2.1, commit 27bc4c4b101e27994e01e36566a0f2091bbca507, Apache-2.0. Official CLI/YAML only; no source modifications. https://github.com/lima-vm/lima/tree/v2.2.1
- mkcert 1.4.4, BSD-3-Clause. Official Windows-amd64 and Darwin-arm64 releases; host-local CA, no CA private key in Linux packages. https://github.com/FiloSottile/mkcert/tree/v1.4.4
- Ubuntu 26.04 provides systemd/Python and native runtime libraries through its signed package repositories. Lima image is pinned in deployment/lima.yaml; runtime archive includes the existing pure-Python wheels.
- Native arm64 materials use the same upstream versions and patches as amd64, as recorded in artifacts-arm64.json. Mac runtime acceptance remains pending; dependency support alone is not a product acceptance claim.
