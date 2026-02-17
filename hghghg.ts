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
