def resolve_schema(schema: dict, spec: dict):
    if not isinstance(schema, dict):
        return schema
 
    if "$ref" in schema:
        resolved = resolve_ref(schema["$ref"], spec)
        return resolve_schema(resolved, spec)
 
    resolved_schema = {}
    for key, value in schema.items():
        if isinstance(value, dict):
            resolved_schema[key] = resolve_schema(value, spec)
        elif isinstance(value, list):
            resolved_schema[key] = [
                resolve_schema(item, spec) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            resolved_schema[key] = value
 
    return resolved_schema
