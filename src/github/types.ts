/**
 * GitHub API レスポンス用の型定義
 */

export interface GitHubBranch {
  object: {
    sha: string;
  };
}

export interface GitHubCommit {
  sha: string;
  tree: {
    sha: string;
  };
  parents: Array<{
    sha: string;
  }>;
}

export interface GitHubBlob {
  sha: string;
  url: string;
}

export interface GitHubTree {
  sha: string;
  url: string;
  tree: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string;
  }>;
}

export interface GitHubFile {
  sha: string;
  content: string;
  encoding: string;
  size: number;
  name: string;
  path: string;
}

export interface GitHubCreateBlobRequest {
  content: string;
  encoding: "base64" | "utf-8";
}

export interface GitHubCreateTreeRequest {
  base_tree?: string;
  tree: Array<{
    path: string;
    mode: string;
    type: "blob" | "tree" | "commit";
    sha?: string;
    content?: string;
  }>;
}

export interface GitHubCreateCommitRequest {
  message: string;
  tree: string;
  parents: string[];
  author?: {
    name: string;
    email: string;
    date?: string;
  };
  committer?: {
    name: string;
    email: string;
    date?: string;
  };
}

export interface GitHubUpdateRefRequest {
  sha: string;
  force?: boolean;
}

export interface GitHubDeleteFileRequest {
  message: string;
  sha: string;
  branch?: string;
  committer?: {
    name: string;
    email: string;
  };
}

export interface GitHubUpdateFileRequest {
  message: string;
  content: string;
  sha?: string;
  branch?: string;
  committer?: {
    name: string;
    email: string;
  };
}