// TeamCity configuration for studio-write.
//
// Scope is deliberately narrow: this file owns the *heavy* checks that
// belong on Automattic's macOS agent pool — packaging the Electron app and
// running the Playwright e2e suite against the packaged build. The fast
// checks (typecheck, lint, unit tests) stay in .github/workflows/ci.yml so
// contributors get sub-2-minute feedback directly in the PR UI.
//
// The credentialsJSON tokens below are placeholders. After importing this
// project into TeamCity, replace each one with a real credential reference
// from the project's Settings → Connections page.

import jetbrains.buildServer.configs.kotlin.v2019_2.BuildType
import jetbrains.buildServer.configs.kotlin.v2019_2.buildFeatures.PullRequests
import jetbrains.buildServer.configs.kotlin.v2019_2.buildFeatures.commitStatusPublisher
import jetbrains.buildServer.configs.kotlin.v2019_2.buildFeatures.perfmon
import jetbrains.buildServer.configs.kotlin.v2019_2.buildFeatures.pullRequests
import jetbrains.buildServer.configs.kotlin.v2019_2.buildSteps.script
import jetbrains.buildServer.configs.kotlin.v2019_2.project
import jetbrains.buildServer.configs.kotlin.v2019_2.triggers.vcs
import jetbrains.buildServer.configs.kotlin.v2019_2.vcs.GitVcsRoot
import jetbrains.buildServer.configs.kotlin.v2019_2.version

version = "2023.05"

object StudioWriteVcs : GitVcsRoot({
	name = "studio-write"
	url = "git@github.com:Automattic/studio-write.git"
	branch = "refs/heads/trunk"
	branchSpec = """
		+:refs/heads/*
		+:refs/pull/*/head
	""".trimIndent()
	authMethod = uploadedKey {
		uploadedKey = "Studio Write GitHub"
	}
})

project {
	vcsRoot(StudioWriteVcs)
	buildType(E2ETests)

	params {
		// Studio Write ships for macOS, so e2e runs natively on the mac
		// agent pool. The default tags a regular mac agent — tighten this
		// (e.g. `osx-15-arm64`) if the pool needs a specific OS revision.
		param("env.AGENT_OS", "osx")
	}
}

object E2ETests : BuildType({
	id("StudioWrite_E2ETests")
	name = "E2E tests"
	description = "Packages the Electron app and runs the Playwright e2e suite against the packaged binary."

	vcs {
		root(StudioWriteVcs)
		cleanCheckout = true
	}

	params {
		// Most e2e specs don't need an API key, but agent.spec.ts and a few
		// adjacent specs hit the real Anthropic API. Wire a project-level
		// secret param in TeamCity (Settings → Parameters) named
		// `env.ANTHROPIC_API_KEY` with type "Password" — the empty default
		// here lets the build queue without one (those specs will error,
		// but the rest pass).
		password("env.ANTHROPIC_API_KEY", "", display = jetbrains.buildServer.configs.kotlin.v2019_2.ParameterDisplay.HIDDEN)
	}

	steps {
		script {
			name = "Use Node from .nvmrc"
			scriptContent = """
				#!/bin/bash
				set -euo pipefail

				# Mac agents ship with nvm; load it and select the version
				# pinned by the repo so this build can't drift from local dev.
				export NVM_DIR="${'$'}HOME/.nvm"
				. "${'$'}NVM_DIR/nvm.sh"
				nvm install
				nvm use
				node --version
			""".trimIndent()
		}

		script {
			name = "Install dependencies"
			scriptContent = """
				#!/bin/bash
				set -euo pipefail
				export NVM_DIR="${'$'}HOME/.nvm"
				. "${'$'}NVM_DIR/nvm.sh"
				nvm use
				# `npm ci` for reproducible installs against the committed lockfile.
				npm ci
			""".trimIndent()
		}

		script {
			name = "Playwright e2e suite"
			scriptContent = """
				#!/bin/bash
				set -euo pipefail
				export NVM_DIR="${'$'}HOME/.nvm"
				. "${'$'}NVM_DIR/nvm.sh"
				nvm use

				# tests/global-setup.ts handles packaging the app with
				# TEST_BUILD=1 before any spec runs; we just invoke playwright.
				npm run test:e2e
			""".trimIndent()
		}
	}

	triggers {
		vcs {
			branchFilter = """
				+:*
				-:pull/*/merge
			""".trimIndent()
		}
	}

	failureConditions {
		executionTimeoutMin = 30
	}

	features {
		perfmon {}
		pullRequests {
			vcsRootExtId = "${StudioWriteVcs.id}"
			provider = github {
				authType = token {
					// Replace with a real credential reference once the
					// project is imported into TeamCity. See file header.
					token = "credentialsJSON:studio-write-github-token"
				}
				filterAuthorRole = PullRequests.GitHubRoleFilter.EVERYBODY
			}
		}
		commitStatusPublisher {
			vcsRootExtId = "${StudioWriteVcs.id}"
			publisher = github {
				githubUrl = "https://api.github.com"
				authType = personalToken {
					token = "credentialsJSON:studio-write-github-token"
				}
			}
		}
	}

	requirements {
		// Pin the build to a mac agent. Without this, TeamCity might queue
		// the build on a Linux agent that can't run the Electron suite.
		equals("teamcity.agent.jvm.os.family", "Mac OS")
	}
})
