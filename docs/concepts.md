# Concepts

## Tool call

A tool call is an attempted action by an agent. It has an `agent`, `tool`, `args`, optional `context`, and an `execute` callback owned by the application.

## Policy

In this open source runtime, policies are provided as local YAML files so developers can inspect and run the enforcement logic without a hosted service. Policies are evaluated in order. The first matching rule wins.

## Enforcement

The SDK evaluates policy before running `execute`. It only runs the callback for `allow` and `log_only`.

For `block` and `require_approval`, the SDK does not run `execute`.

## Audit

The local audit logger appends JSONL events to `.enforra/audit.jsonl` with redacted args and context.
