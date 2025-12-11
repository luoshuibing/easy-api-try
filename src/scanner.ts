/**
 * 说明：Spring Boot接口扫描器
 * 功能：遍历工作区的Java文件，识别@RestController/@Controller以及@GetMapping/@PostMapping/@RequestMapping等注解，
 *      提取HTTP方法与路径，生成可调试的接口列表。
 */
import * as vscode from 'vscode';

export type Endpoint = {
  method: string;
  path: string;
  file: string;
  className?: string;
  variables?: string[];
};

const METHOD_MAP: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Delete: 'DELETE',
  Patch: 'PATCH',
};

export async function scanSpringBootEndpoints(log?: (line: string) => void): Promise<Endpoint[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return [];
  }

  const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/{build,target}/**');
  log?.(`开始扫描 Spring Boot 接口，Java 文件数：${javaFiles.length}`);
  const endpoints: Endpoint[] = [];

  for (const file of javaFiles) {
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      const content = Buffer.from(bytes).toString('utf8');

      // 仅在@RestController或@Controller类中考虑映射
      const isController = /@(RestController|Controller)\b/.test(content);
      if (!isController) continue;

      const classNameMatch = content.match(/class\s+([A-Za-z0-9_]+)/);
      const className = classNameMatch ? classNameMatch[1] : undefined;

      const classBasePath = extractClassBasePath(content) || '';

      // 匹配@GetMapping/@PostMapping/@PutMapping/@DeleteMapping/@PatchMapping（含无参数或空括号）
      const mappingRegex = /@(?:(Get|Post|Put|Delete|Patch)Mapping)(?:\(\s*(?:value|path)\s*=\s*"([^"]+)"\s*\)|\(\s*"([^"]+)"\s*\)|\(\s*\))?/g;
      let m: RegExpExecArray | null;
      while ((m = mappingRegex.exec(content))) {
        const methodToken = (m[1] || m[3]) as keyof typeof METHOD_MAP;
        const method = METHOD_MAP[methodToken] || 'GET';
        const subPath = (m[2] || m[3]) || '';
        const fullPath = normalizePath(classBasePath, subPath);
        const variables = extractPathVariables(fullPath);
        endpoints.push({ method, path: fullPath, file: file.fsPath, className, variables });
        log?.(`映射：${method} ${fullPath} @ ${file.fsPath}`);
      }

      // 匹配@RequestMapping(method = RequestMethod.GET, value = "/xxx")
      const requestMappingRegex = /@RequestMapping\(([^)]*)\)/g;
      let rm: RegExpExecArray | null;
      while ((rm = requestMappingRegex.exec(content))) {
        const args = rm[1];
        const methodMatch = args.match(/method\s*=\s*RequestMethod\.([A-Z]+)/);
        const valueMatch = args.match(/(?:value|path)\s*=\s*"([^"]+)"/);
        const subPath = valueMatch ? valueMatch[1] : '';
        const method = (methodMatch ? methodMatch[1] : 'GET').toUpperCase();
        const fullPath = normalizePath(classBasePath, subPath || '');
        if (subPath || methodMatch) {
          const variables = extractPathVariables(fullPath);
          endpoints.push({ method, path: fullPath, file: file.fsPath, className, variables });
          log?.(`映射：${method} ${fullPath} @ ${file.fsPath}`);
        }
      }
    } catch (e) {
      // 忽略单文件读取/解析错误，继续扫描其他文件
    }
  }

  // 去重（按method+path）
  const uniq = new Map<string, Endpoint>();
  for (const ep of endpoints) {
    uniq.set(`${ep.method} ${ep.path}`, ep);
  }
  const result = Array.from(uniq.values());
  log?.(`扫描完成，唯一接口数：${result.length}`);
  return result;
}

function extractClassBasePath(content: string): string | undefined {
  // @RequestMapping("/base") 或 @RequestMapping(path="/base")
  const direct = content.match(/@RequestMapping\(\s*"([^"]+)"\s*\)/);
  if (direct) return direct[1];
  const kv = content.match(/@RequestMapping\(\s*(?:value|path)\s*=\s*"([^"]+)"\s*\)/);
  if (kv) return kv[1];
  return undefined;
}

function normalizePath(base: string, sub: string): string {
  const b = base || '';
  const s = sub || '';
  const joined = `${trimRightSlash(b)}/${trimLeftSlash(s)}`;
  return joined.replace(/\/+/g, '/').replace(/(^\/)\/+/, '$1');
}

function trimLeftSlash(p: string): string {
  return p.replace(/^\/+/, '');
}

function trimRightSlash(p: string): string {
  return p.replace(/\/+$/, '');
}

function extractPathVariables(p: string): string[] {
  const vars: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) {
    const name = m[1].trim();
    if (name && !vars.includes(name)) vars.push(name);
  }
  return vars;
}
