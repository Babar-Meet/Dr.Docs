# vendor/bin - portable external tools

Dr.Docs resolves external binaries in this order: environment variable (`QPDF_BIN`, `LIBREOFFICE_BIN`), then this folder, then PATH. Drop bundle-ready tool releases here, nothing else:

- `qpdf.exe` (Windows) or `qpdf` (Linux, macOS): qpdf 11.x, including its DLL sidecars
- `soffice.exe` or `soffice`: LibreOffice, needs its full program folder next to the launcher; when a system install provides its own path, set `LIBREOFFICE_BIN` instead

Everything under `vendor/` stays out of git except this README. Each tool's license travels with its binaries.
