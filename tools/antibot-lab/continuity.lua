-- WHY: consume upstream JA4 raw fields; TLS 1.3 resumption adds PSK (RFC8446
-- 4.2.11). Preserve full JA4, but never classify that normal change as a new
-- client. This adapter is not a JA4 implementation or a bot identity claim.
core.register_action("bat_continuity", { "http-req" }, function(txn)
    local raw = txn:get_var("txn.ja4_r") or ""
    local prefix, ciphers, extensions, signatures = raw:match("^([^_]+)_([^_]+)_([^_]+)_?(.*)$")
    if not prefix or ciphers == "000000000000" or extensions == "000000000000" then
        txn:set_var("txn.continuity_valid", "false")
        txn:set_var("txn.continuity", "")
        return
    end
    local stable = {}
    for extension in extensions:gmatch("[^,]+") do
        if extension ~= "0029" then stable[#stable + 1] = extension end
    end
    local value = prefix:sub(1, 3) .. "_" .. ciphers .. "_" .. table.concat(stable, ",") .. "_" .. signatures
    txn:set_var("txn.continuity", string.lower(txn.c:hex(txn.c:digest(value, "sha256"))))
    txn:set_var("txn.continuity_valid", "true")
end, 0)
