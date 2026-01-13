def _get_content_from_spec(self, spec: dict, url: str, method: str) -> str | None:
    paths = spec.get("paths", {})

    resolved_path = resolve_openapi_path(paths, url)
    if not resolved_path:
        print(f"❌ No OpenAPI path matches URL: {url}")
        return None

    method_obj = paths[resolved_path].get(method.lower())
    if not method_obj:
        print(f"❌ Method {method} not defined for {resolved_path}")
        return None

    request_body = method_obj.get("requestBody", {})
    content = request_body.get("content")

    return content


import re

def resolve_openapi_path(paths: dict, actual_url: str) -> str | None:
    for spec_path in paths.keys():
        # Replace {param} with regex matcher
        pattern = re.sub(r"\{[^/]+\}", r"[^/]+", spec_path)
        pattern = f"^{pattern}$"

        if re.match(pattern, actual_url):
            return spec_path

    return None
