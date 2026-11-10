import { sendblueHeaders } from "../_shared/runtime.mjs";

// One emoji per photo, selected by the existing vision request. Keep the
// prompt's labeled choices and the strict response schema in sync.
export const FOOD_REACTIONS = Object.freeze({
  burger:"🍔", pineapple:"🍍", pizza:"🍕", fries:"🍟", hot_dog:"🌭", sandwich:"🥪",
  taco:"🌮", burrito:"🌯", salad:"🥗", pasta:"🍝", noodles:"🍜", rice:"🍚",
  curry_rice:"🍛", soup_or_stew:"🍲", paella:"🥘", sushi:"🍣", dumplings:"🥟",
  falafel:"🧆", chicken_leg:"🍗", steak:"🥩", bacon:"🥓", egg:"🥚", fried_egg:"🍳",
  fish:"🐟", shrimp:"🦐", lobster:"🦞", crab:"🦀", oyster:"🦪",
  bread:"🍞", baguette:"🥖", croissant:"🥐", bagel:"🥯", pancakes:"🥞", waffle:"🧇",
  cheese:"🧀", pretzel:"🥨", popcorn:"🍿", peanuts:"🥜", beans:"🫘",
  apple:"🍎", green_apple:"🍏", banana:"🍌", orange:"🍊", lemon:"🍋", pear:"🍐",
  peach:"🍑", cherries:"🍒", grapes:"🍇", watermelon:"🍉", melon:"🍈",
  strawberries:"🍓", blueberries:"🫐", mango:"🥭", kiwi:"🥝", coconut:"🥥",
  avocado:"🥑", tomato:"🍅", broccoli:"🥦", carrot:"🥕", corn:"🌽", cucumber:"🥒",
  leafy_greens:"🥬", potato:"🥔", sweet_potato:"🍠", eggplant:"🍆", bell_pepper:"🫑",
  cake:"🍰", cupcake:"🧁", cookie:"🍪", doughnut:"🍩", ice_cream:"🍨",
  soft_serve:"🍦", chocolate:"🍫", candy:"🍬", pie:"🥧", honey:"🍯",
  wine:"🍷", beer:"🍺", cocktail:"🍸", tropical_drink:"🍹", milk:"🥛",
  coffee:"☕", tea:"🍵", bubble_tea:"🧋", juice_or_soft_drink:"🥤", water:"💧",
});
export const REACTIONS = Object.freeze([...new Set([
  "💪", "💧", "🙌", "👍", "😊", "😔", "👋", "😋", ...Object.values(FOOD_REACTIONS),
])]);
// Primary handles are UUIDs on the pilot line. Do not derive a parent from
// attachment-specific handles or guess multipart indexes.
const PRIMARY_HANDLE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function sendReaction({ getEnv, fetchImpl = fetch, payload, reaction }) {
  if (!REACTIONS.includes(reaction) || payload.service !== "iMessage" ||
      !PRIMARY_HANDLE.test(payload.message_handle || "")) return "skipped";
  // Cosmetic, one attempt only, after the text has been durably completed.
  // A timeout or unsupported line must never retry the text or the reaction.
  try {
    const response = await fetchImpl("https://api.sendblue.com/api/send-reaction", {
      method: "POST", headers: sendblueHeaders(getEnv), signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ from_number: getEnv("SENDBLUE_FROM_NUMBER"),
        message_handle: payload.message_handle, reaction }),
    });
    if (!response.ok) return "unavailable";
    const result = await response.json();
    return result.status === "OK" ? "accepted" : "unavailable";
  } catch { return "unavailable"; }
}
