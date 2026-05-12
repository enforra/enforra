# Concepts

## Tool call

A tool call is an attempted action by an agent. It has an `agent`, `tool`, `args`, optional `context`, and an `execute` callback owned by the application.

## Policy

A policy is a local YAML file. Policies are evaluated in order. The first matching rule wins.

## Enforcement

The SDK evaluates policy before running `execute`. It only runs the callback for `allow` and `log_only`.

## Audit

The local audit logger appends JSONL events to `.enforra/audit.jsonl` with redacted args and context.
