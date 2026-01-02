var flags;
(function (flags) {
    flags[flags["DISABLE_FORWARD"] = 1] = "DISABLE_FORWARD";
    flags[flags["DISABLE_TG2Q"] = 2] = "DISABLE_TG2Q";
    flags[flags["DISABLE_JOIN_NOTICE"] = 4] = "DISABLE_JOIN_NOTICE";
    flags[flags["DISABLE_POKE"] = 8] = "DISABLE_POKE";
    flags[flags["DISABLE_DELETE_MESSAGE"] = 16] = "DISABLE_DELETE_MESSAGE";
    flags[flags["DISABLE_AUTO_CREATE_PM"] = 32] = "DISABLE_AUTO_CREATE_PM";
    flags[flags["COLOR_EMOJI_PREFIX"] = 64] = "COLOR_EMOJI_PREFIX";
    // RICH_HEADER = 1 << 7,
    flags[flags["DISABLE_QUOTE_PIN"] = 256] = "DISABLE_QUOTE_PIN";
    flags[flags["DISABLE_FORWARD_OTHER_BOT"] = 512] = "DISABLE_FORWARD_OTHER_BOT";
    // USE_MARKDOWN = 1 << 10,
    flags[flags["DISABLE_SEAMLESS"] = 2048] = "DISABLE_SEAMLESS";
    flags[flags["DISABLE_FLASH_PIC"] = 4096] = "DISABLE_FLASH_PIC";
    flags[flags["DISABLE_SLASH_COMMAND"] = 8192] = "DISABLE_SLASH_COMMAND";
    flags[flags["DISABLE_RICH_HEADER"] = 16384] = "DISABLE_RICH_HEADER";
    flags[flags["DISABLE_OFFLINE_NOTICE"] = 32768] = "DISABLE_OFFLINE_NOTICE";
    flags[flags["HIDE_ALL_QQ_NUMBER"] = 65536] = "HIDE_ALL_QQ_NUMBER";
    flags[flags["NAME_LOCKED"] = 131072] = "NAME_LOCKED";
    flags[flags["ALWAYS_FORWARD_TG_FILE"] = 262144] = "ALWAYS_FORWARD_TG_FILE";
    flags[flags["QQ_HEADER_IMAGE"] = 524288] = "QQ_HEADER_IMAGE";
    flags[flags["DISABLE_ERROR_NOTIFY"] = 1048576] = "DISABLE_ERROR_NOTIFY";
})(flags || (flags = {}));
export default flags;
