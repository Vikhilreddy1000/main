batch_size = 5
        batches = [
            chunk_results[i:i + batch_size]
            for i in range(0, len(chunk_results), batch_size)
        ]

        # 🔥 Parallel batch processing
        partial_results = await asyncio.gather(
            *[process_batch(batch) for batch in batches]
        )

        # 🔥 Final combine (single call)
        final_combined_text = "\n\n".join(partial_results)

        final_messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(
                content=f"""
Combine the following partial OpenAPI YAML fragments
into ONE final valid OpenAPI 3.0 specification:

{final_combined_text}
"""
            )
        ]

        final_result = await self.llm.ainvoke(final_messages)



if hasattr(result, "content"):
                    return result.content
                elif isinstance(result, str):
                    return result
                return str(result or "")


















import yaml

from copy import deepcopy
 
def merge_openapi_fragments(yaml_chunks: list[str]) -> str:

    merged = {}
 
    for chunk in yaml_chunks:

        if not chunk.strip():

            continue
 
        parsed = yaml.safe_load(chunk)

        if not parsed:

            continue
 
        # First chunk initializes base structure

        if not merged:

            merged = deepcopy(parsed)

            continue
 
        # Merge paths

        if "paths" in parsed:

            merged.setdefault("paths", {})

            for path, methods in parsed["paths"].items():

                merged["paths"].setdefault(path, {})

                merged["paths"][path].update(methods)
 
        # Merge components

        if "components" in parsed:

            merged.setdefault("components", {})

            for key, value in parsed["components"].items():

                merged["components"].setdefault(key, {})

                merged["components"][key].update(value)
 
    return yaml.safe_dump(merged, sort_keys=False)

 
