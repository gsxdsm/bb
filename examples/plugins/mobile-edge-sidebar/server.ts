import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function mobileEdgeSidebar(bb: BbPluginApi) {
  bb.log.info("Mobile edge sidebar enabled");
}
