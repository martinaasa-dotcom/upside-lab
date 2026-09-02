/**
 * One place for how big a chat turn may be, because two ends had different
 * answers and the reader paid for it.
 *
 * A screenshot reaches Margus as a base64 data URL inside the JSON body.
 * The browser compressed one to anything up to 4.5 million characters
 * before trying harder, and the server refused any body over 1,000,000
 * bytes with "That request was too big." A 2048px JPEG of a broker app at
 * quality 0.9 is comfortably past that once base64 has added its third, so
 * pasting an ordinary screenshot into the chat failed, and the reader was
 * told only that their request was too big.
 *
 * The numbers below are one budget split in two, and the client's is
 * deliberately the smaller: an image has to leave room for the
 * conversation and the portfolio context travelling beside it. The ceiling
 * over both is the platform's, which will not carry a request body past
 * about 4.5 MB whatever this file says.
 */

/** Most a whole chat request body may be. Under the platform's own limit. */
export const CHAT_MAX_BODY_BYTES = 3_000_000;

/**
 * Most one image may be, as data URL characters.
 *
 * Two of these plus a conversation still fit the body budget, and one is
 * plenty of room for a phone screenshot at full width.
 */
export const CHAT_MAX_IMAGE_CHARS = 1_200_000;

/**
 * Most one message's text may be, in characters.
 *
 * Every message in the conversation is sent back with each turn, and the
 * whole of it goes to the model, so this is the one bound the body cap
 * cannot give on its own: forty messages of a body's worth each would be
 * refused by the body cap, but one message carrying most of a body would
 * not. A pasted holdings export runs a few thousand characters and a long
 * reply from Margus a few thousand more, so this is many times either.
 */
export const CHAT_MAX_MESSAGE_CHARS = 32_000;

/**
 * Cost budget for chat, in kilobytes per window, charged by what a turn
 * actually weighs.
 *
 * Counting turns cannot tell a one-line question from a megabyte of image,
 * and the model is billed for the difference. At 30 turns per 5 minutes a
 * body cap alone allowed 90 MB of input in that window from one account.
 * An ordinary text turn is a couple of kilobytes, so this is thousands of
 * them, and it is four full screenshots.
 */
export const CHAT_BYTE_BUDGET_KB = 12_000;
export const CHAT_BYTE_WINDOW_MS = 5 * 60_000;
