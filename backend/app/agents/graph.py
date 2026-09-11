"""Assembles the per-run LangGraph StateGraph.

question_generator is intentionally NOT a node here — it runs once per
dataset (see agents/nodes/question_generator.py + api/research_questions.py).
This graph runs once per ResearchQuestion, i.e. once per AnalysisRun:

    START
      -> code_generator
      -> sandbox_execute
      -> [conditional] succeeded?    -> result_analyzer -> insight_writer
                                          -> visualization_builder -> END
                        not yet, retry -> code_corrector -> sandbox_execute (loop)
                        attempts exhausted -> give_up -> END
"""
from langgraph.graph import StateGraph, START, END

from app.agents.state import AnalysisState
from app.agents.nodes.code_generator import code_generator
from app.agents.nodes.sandbox_execute import sandbox_execute, route_after_execution
from app.agents.nodes.code_corrector import code_corrector
from app.agents.nodes.result_analyzer import result_analyzer
from app.agents.nodes.insight_writer import insight_writer
from app.agents.nodes.visualization_builder import visualization_builder


async def give_up(state: AnalysisState) -> AnalysisState:
    last_execution = state["execution_history"][-1]
    return {
        **state,
        "status": "failed",
        "error_traceback": last_execution["stderr"],
    }


def build_analysis_graph():
    graph = StateGraph(AnalysisState)

    graph.add_node("code_generator", code_generator)
    graph.add_node("sandbox_execute", sandbox_execute)
    graph.add_node("code_corrector", code_corrector)
    graph.add_node("result_analyzer", result_analyzer)
    graph.add_node("insight_writer", insight_writer)
    graph.add_node("visualization_builder", visualization_builder)
    graph.add_node("give_up", give_up)

    graph.add_edge(START, "code_generator")
    graph.add_edge("code_generator", "sandbox_execute")

    graph.add_conditional_edges(
        "sandbox_execute",
        route_after_execution,
        {
            "result_analyzer": "result_analyzer",
            "code_corrector": "code_corrector",
            "give_up": "give_up",
        },
    )

    graph.add_edge("code_corrector", "sandbox_execute")
    graph.add_edge("result_analyzer", "insight_writer")
    graph.add_edge("insight_writer", "visualization_builder")
    graph.add_edge("visualization_builder", END)
    graph.add_edge("give_up", END)

    return graph.compile()


# Module-level singleton — compiling the graph is cheap but no need to redo
# it on every request.
analysis_graph = build_analysis_graph()


async def run_analysis(initial_state: AnalysisState) -> AnalysisState:
    """Entry point called from the API/background task layer."""
    final_state = await analysis_graph.ainvoke(initial_state)
    return final_state
