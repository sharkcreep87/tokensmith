import type { Command } from "commander";

/**
 * Shell autocomplete installer. We ship static scripts for bash/zsh/fish and
 * print them to stdout so users can pipe the output into their rc file:
 *
 *   tokensmith completion bash >> ~/.bashrc
 */
const BASH_SCRIPT = `
# TokenSmith bash completion
_tokensmith_complete() {
  local cur prev words cword
  _init_completion || return
  local cmds="memory skill context compress tokens session init completion plugin --help --version"
  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )
    return
  fi
  case "$prev" in
    memory)   COMPREPLY=( $(compgen -W "save get list delete clean export import" -- "$cur") );;
    skill)    COMPREPLY=( $(compgen -W "add run list delete" -- "$cur") );;
    compress) COMPREPLY=( $(compgen -W "session project" -- "$cur") );;
    tokens)   COMPREPLY=( $(compgen -W "stats report recent" -- "$cur") );;
    session)  COMPREPLY=( $(compgen -W "append list" -- "$cur") );;
    *)        COMPREPLY=( $(compgen -f -- "$cur") );;
  esac
}
complete -F _tokensmith_complete tokensmith
complete -F _tokensmith_complete ts-smith
`;

const ZSH_SCRIPT = `
# TokenSmith zsh completion
_tokensmith() {
  local -a commands
  commands=(
    'memory:persistent memory'
    'skill:reusable prompt templates'
    'context:build smart context bundle'
    'compress:compress session or project'
    'tokens:token usage analytics'
    'session:session messages'
    'init:initialise project'
    'completion:shell completion scripts'
    'plugin:plugin utilities'
  )
  _describe 'tokensmith command' commands
}
compdef _tokensmith tokensmith
compdef _tokensmith ts-smith
`;

const FISH_SCRIPT = `
# TokenSmith fish completion
complete -c tokensmith -n '__fish_use_subcommand' -a 'memory skill context compress tokens session init completion plugin'
complete -c ts-smith    -n '__fish_use_subcommand' -a 'memory skill context compress tokens session init completion plugin'
`;

export function registerCompletionCommand(program: Command): void {
  program
    .command("completion <shell>")
    .description("Print shell completion script (bash | zsh | fish)")
    .action((shell: string) => {
      const normalised = shell.trim().toLowerCase();
      switch (normalised) {
        case "bash":
          process.stdout.write(BASH_SCRIPT);
          break;
        case "zsh":
          process.stdout.write(ZSH_SCRIPT);
          break;
        case "fish":
          process.stdout.write(FISH_SCRIPT);
          break;
        default:
          process.stderr.write(
            `Unsupported shell: ${shell}. Use bash, zsh, or fish.\n`
          );
          process.exitCode = 2;
      }
    });
}
