"""Tests for deploy notification logic.

Run from repo root: `python3 -m pytest scripts/tests/ -v`
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from deploy_notify import (
    sanitize_slack_mrkdwn,
    build_slack_payload,
    truncate_commit_message,
    parse_changelog,
    build_header,
    build_fallback_message,
    build_bedrock_payload,
    wrap_ai_summary,
    SYSTEM_PROMPT,
    BEDROCK_MODEL_ID,
)


class TestSanitizeSlackMrkdwn:
    def test_strips_channel_mention(self):
        assert "<!channel>" not in sanitize_slack_mrkdwn("hello <!channel> world")

    def test_strips_user_mention(self):
        assert "<@U123>" not in sanitize_slack_mrkdwn("ping <@U123> now")

    def test_strips_channel_link(self):
        assert "<#C123>" not in sanitize_slack_mrkdwn("see <#C123|general>")

    def test_strips_url_spoofing(self):
        result = sanitize_slack_mrkdwn("visit <https://evil.com|our site>")
        assert "<https://evil.com|our site>" not in result

    def test_preserves_normal_text(self):
        assert sanitize_slack_mrkdwn("normal commit message") == "normal commit message"

    def test_preserves_markdown_formatting(self):
        assert sanitize_slack_mrkdwn("*bold* and _italic_") == "*bold* and _italic_"

    def test_handles_empty_string(self):
        assert sanitize_slack_mrkdwn("") == ""

    def test_strips_multiple_injections(self):
        result = sanitize_slack_mrkdwn("<!channel> <@U1> <https://x.com|click>")
        assert "<!" not in result
        assert "<@" not in result
        assert "<http" not in result


class TestBuildSlackPayload:
    def test_returns_valid_json(self):
        payload = build_slack_payload("Deploy update", "abc1234")
        parsed = json.loads(payload)
        assert "blocks" in parsed
        assert "text" in parsed

    def test_uses_mrkdwn_block(self):
        payload = build_slack_payload("some *bold* text", "abc1234")
        parsed = json.loads(payload)
        block = parsed["blocks"][0]
        assert block["type"] == "section"
        assert block["text"]["type"] == "mrkdwn"

    def test_truncates_long_text(self):
        long_text = "x" * 5000
        payload = build_slack_payload(long_text, "abc1234")
        parsed = json.loads(payload)
        block_text = parsed["blocks"][0]["text"]["text"]
        assert len(block_text) <= 2900

    def test_escapes_special_json_chars(self):
        payload = build_slack_payload('message with "quotes" and \\backslash', "abc1234")
        json.loads(payload)  # should not raise

    def test_fallback_text_references_bluebubbles(self):
        payload = build_slack_payload("update", "deadbeef123")
        parsed = json.loads(payload)
        assert "BlueBubbles" in parsed["text"]
        assert "deadbee" in parsed["text"]

    def test_sanitizes_content(self):
        payload = build_slack_payload("<!channel> alert", "abc1234")
        parsed = json.loads(payload)
        block_text = parsed["blocks"][0]["text"]["text"]
        assert "<!channel>" not in block_text


class TestTruncateCommitMessage:
    def test_short_message_unchanged(self):
        assert truncate_commit_message("short msg") == "short msg"

    def test_long_message_truncated(self):
        result = truncate_commit_message("x" * 300)
        assert len(result) <= 200
        assert result.endswith("...")

    def test_exact_200_not_truncated(self):
        msg = "x" * 200
        assert truncate_commit_message(msg) == msg


class TestParseChangelog:
    def test_combines_merges_and_commits(self):
        merges = "feat: audio transcripts\nfix: guid prefix"
        commits = "abc1234 chore: bump deps"
        result = parse_changelog(merges, commits)
        assert "audio transcripts" in result
        assert "guid prefix" in result
        assert "bump deps" in result

    def test_empty_both_returns_empty(self):
        assert parse_changelog("", "") == ""

    def test_deduplicates_identical_lines(self):
        merges = "feat: same change"
        commits = "abc1234 feat: same change"
        result = parse_changelog(merges, commits)
        assert result.count("same change") == 1

    def test_truncates_long_messages(self):
        merges = "x" * 300
        result = parse_changelog(merges, "")
        lines = [l for l in result.split("\n") if l.strip()]
        for line in lines:
            assert len(line) <= 200

    def test_strips_empty_lines(self):
        merges = "feat: one\n\n\nfeat: two\n"
        result = parse_changelog(merges, "")
        lines = result.strip().split("\n")
        assert all(l.strip() for l in lines)

    def test_handles_multiline_merge_body(self):
        merges = "chore: release v1.15.0\n\n* feat: thing one\n* fix: thing two"
        result = parse_changelog(merges, "")
        assert "thing one" in result
        assert "thing two" in result

    def test_strips_bullet_prefix(self):
        merges = "* feat: bullet item"
        result = parse_changelog(merges, "")
        assert result.startswith("feat:")

    def test_strips_commit_hash(self):
        commits = "abc1234 feat: hashed commit"
        result = parse_changelog("", commits)
        assert "abc1234" not in result
        assert "hashed commit" in result


class TestBuildHeader:
    def test_includes_sha(self):
        header = build_header("deadbeef123")
        assert "deadbee" in header

    def test_includes_version_when_provided(self):
        header = build_header("abc1234", version="1.15.0")
        assert "v1.15.0" in header

    def test_omits_version_when_blank(self):
        header = build_header("abc1234", version="")
        assert "v" not in header.split("(")[1]  # no v inside the parens

    def test_mentions_canon(self):
        header = build_header("abc1234")
        assert "canon" in header.lower()

    def test_first_run_adds_note(self):
        header = build_header("abc1234", first_run=True)
        assert "first" in header.lower()


class TestBuildFallbackMessage:
    def test_includes_sha(self):
        result = build_fallback_message("- feat: thing", "abc1234def")
        assert "abc1234" in result

    def test_includes_version(self):
        result = build_fallback_message("- feat: thing", "abc1234", version="1.15.0")
        assert "v1.15.0" in result

    def test_includes_changes(self):
        result = build_fallback_message("- feat: new feature", "abc1234")
        assert "new feature" in result

    def test_sanitizes_content(self):
        result = build_fallback_message("- <!channel> alert", "abc1234")
        assert "<!channel>" not in result

    def test_first_run_note(self):
        result = build_fallback_message("- feat: thing", "abc1234", first_run=True)
        assert "first" in result.lower()


class TestBuildBedrockPayload:
    def test_returns_valid_json(self):
        payload = build_bedrock_payload("feat: new thing\nfix: old thing")
        parsed = json.loads(payload)
        assert "anthropic_version" in parsed
        assert "messages" in parsed
        assert "system" in parsed

    def test_uses_bedrock_version(self):
        payload = build_bedrock_payload("changes")
        parsed = json.loads(payload)
        assert parsed["anthropic_version"] == "bedrock-2023-05-31"

    def test_model_id_is_inference_profile(self):
        assert BEDROCK_MODEL_ID.startswith("us.anthropic.")

    def test_system_prompt_has_injection_guardrail(self):
        assert "untrusted" in SYSTEM_PROMPT.lower()
        assert "do not follow" in SYSTEM_PROMPT.lower()

    def test_system_prompt_references_bluebubbles(self):
        assert "BlueBubbles" in SYSTEM_PROMPT
        assert "iMessage" in SYSTEM_PROMPT

    def test_user_message_contains_changelog(self):
        payload = build_bedrock_payload("feat: added audio transcripts")
        parsed = json.loads(payload)
        user_msg = parsed["messages"][0]["content"]
        assert "audio transcripts" in user_msg

    def test_escapes_special_chars_in_changelog(self):
        payload = build_bedrock_payload('feat: add "quotes" and \\slashes')
        json.loads(payload)  # should not raise

    def test_max_tokens_set(self):
        payload = build_bedrock_payload("changes")
        parsed = json.loads(payload)
        assert parsed["max_tokens"] == 1024


class TestWrapAiSummary:
    def test_prepends_header(self):
        result = wrap_ai_summary("- summary bullet", "abc1234")
        assert result.startswith("BlueBubbles helper deployed")
        assert "summary bullet" in result

    def test_includes_version(self):
        result = wrap_ai_summary("- summary", "abc1234", version="1.15.0")
        assert "v1.15.0" in result
