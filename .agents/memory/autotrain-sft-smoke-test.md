---
name: AutoTrain SFT smoke test
description: Constraints learned while validating the Qwen 1.5B LoRA training pipeline.
---

For a tiny AutoTrain Qwen 1.5B QLoRA smoke test, a 3-example dataset with block size and model max length 512 can fail during packed-dataloader construction because it cannot produce one full packed sequence. Reducing both values to 128 allows the pipeline to complete, but the result is only a pipeline check, not a useful model.

**Why:** the first successful run loaded the model, completed one training step, pushed the adapter to the Hub, and paused the Space; the dataset was far too small for meaningful fine-tuning.

**How to apply:** use short lengths only for smoke tests. Before a real run, expand and quality-check the dataset, then return to 256–512 token lengths and verify the submitted AutoTrain configuration actually contains the intended validation split.